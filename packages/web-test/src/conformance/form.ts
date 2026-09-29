import { existsSync, readFileSync } from "node:fs"
import { basename, extname, resolve } from "node:path"
import type { Locator, Page } from "@playwright/test"
import { expect } from "../fixtures.js"

export const DATE = /^\d{4}-\d{2}-\d{2}$/

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

export type FieldControl =
    "text" | "toggle" | "radio" | "buttonGroup" | "richText" | "calendar" | "combobox" | "image" | "readOnly"

const text = (field: Locator) => field.getByRole("textbox").or(field.getByRole("spinbutton")).first()
const toggle = (field: Locator) => field.getByRole("switch").or(field.getByRole("checkbox")).first()
const editor = (field: Locator) => field.locator(".ql-editor")
const fileInput = (field: Locator) => field.locator("input[type=file]")

const EDITABLE = "input, [contenteditable], [role=combobox], [role=grid], [role=switch], [role=checkbox], [role=radio]"

export const detectControl = async (field: Locator): Promise<FieldControl> => {
    if (await text(field).count()) return "text"
    if (await toggle(field).count()) return "toggle"
    if (await field.getByRole("radio").count()) return "radio"
    if (await editor(field).count()) return "richText"
    if (await field.getByRole("grid").count()) return "calendar"
    if (await field.getByRole("combobox").count()) return "combobox"
    if (await fileInput(field).count()) return "image"
    if (await field.locator("button[aria-pressed]").count()) return "buttonGroup"
    if ((await field.locator(EDITABLE).count()) === 0) return "readOnly"
    throw new Error(`${await field.innerText()} uses a control this suite cannot edit.`)
}

export interface FormContext {
    /** Project root that image paths in the test records are relative to */
    rootDir: string
    /** Whether uploading a file asks the role to assign file permissions */
    assignsFilePermissions: boolean
}

export const setField = async (
    page: Page,
    field: Locator,
    control: FieldControl,
    value: string,
    context: FormContext,
): Promise<string | undefined> => {
    switch (control) {
        case "text":
            await text(field).fill(value)
            return
        case "toggle":
            await toggle(field).setChecked(value === "true")
            return
        case "radio":
            await field.getByRole("radio", { name: value, exact: true }).check()
            return
        case "buttonGroup":
            await field.getByRole("button", { name: value, exact: true }).click()
            return
        case "richText":
            await editor(field).fill(value)
            return
        case "calendar":
            await pickDate(field, value)
            return
        case "combobox":
            return pickOption(page, field, value)
        case "image":
            await uploadImage(page, field, value, context)
            return
        case "readOnly":
            return
    }
}

export const expectField = async (field: Locator, control: FieldControl, value: string): Promise<void> => {
    switch (control) {
        case "text":
            if (value !== "" && Number.isFinite(Number(value))) {
                await expect.poll(async () => Number(await text(field).inputValue())).toBe(Number(value))
            } else {
                await expect(text(field)).toHaveValue(value)
            }
            return
        case "toggle":
            return expect(toggle(field)).toBeChecked({ checked: value === "true" })
        case "radio":
            return expect(field.getByRole("radio", { name: value, exact: true })).toBeChecked()
        case "buttonGroup":
            return expect(field.getByRole("button", { name: value, exact: true })).toHaveAttribute(
                "aria-pressed",
                "true",
            )
        case "richText":
            return expect(editor(field)).toContainText(value)
        case "calendar": {
            const { month, day } = parseDate(value)
            const selected = field.locator("[aria-selected='true']")
            await expect(selected).toHaveCount(1)
            expect([String(day), MONTHS[month - 1].slice(0, 3)]).toContain((await selected.innerText()).trim())
            return
        }
        case "combobox":
            return expect(field.locator("..")).toContainText(value)
        case "image": {
            const image = field.locator("img")
            await expect(image).toBeVisible()
            // eslint-disable-next-line security/detect-non-literal-regexp
            return expect(image).toHaveAttribute("src", new RegExp(`(/|%2F)${escapeRegExp(basename(value))}(\\?|$)`))
        }
        case "readOnly":
            return
    }
}

const parseDate = (value: string) => ({
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
})

const gridCaption = (field: Locator): Promise<string> =>
    field.getByRole("grid").evaluate((grid) => {
        const id = grid.getAttribute("aria-labelledby")
        const caption = id ? grid.ownerDocument.getElementById(id)?.textContent : grid.getAttribute("aria-label")
        return (caption ?? "").replace(/\s+/g, " ").trim()
    })

const pickDate = async (field: Locator, value: string): Promise<void> => {
    const { year, month, day } = parseDate(value)
    const caption = await gridCaption(field)

    if (/^\d{4}$/.test(caption)) {
        const shown = Number(caption)
        const direction = year > shown ? 1 : -1
        for (let next = shown + direction; direction * (next - year) <= 0; next += direction) {
            await field.getByRole("button", { name: direction > 0 ? "Go to next year" : "Go to previous year" }).click()
            await expect(field.getByRole("grid", { name: String(next) })).toBeVisible()
        }
        await field.getByRole("gridcell", { name: MONTHS[month - 1].slice(0, 3), exact: true }).click()
        return
    }

    const [shownMonth, shownYear] = caption.split(" ")
    const target = year * 12 + month - 1
    const shown = Number(shownYear) * 12 + MONTHS.indexOf(shownMonth)
    const direction = target > shown ? 1 : -1
    for (let next = shown + direction; direction * (next - target) <= 0; next += direction) {
        await field.getByRole("button", { name: direction > 0 ? "Go to next month" : "Go to previous month" }).click()
        await expect(field.getByRole("grid", { name: `${MONTHS[next % 12]} ${Math.floor(next / 12)}` })).toBeVisible()
    }
    await field.locator("[role=grid] button:not(.day-outside)").getByText(String(day), { exact: true }).click()
}

const pickOption = async (page: Page, field: Locator, value: string): Promise<string | undefined> => {
    const combobox = field.getByRole("combobox").first()
    if ((await combobox.innerText()).trim() === value) return

    await combobox.click()
    const search = page.locator("[cmdk-input]")
    if (await search.count()) await search.fill(value)
    const options = page.getByRole("option")
    await expect(options.or(page.getByText(/^No .+ found\.$/)).first()).toBeVisible()
    const exact = options.filter({ has: page.getByText(value, { exact: true }) })
    const option = (await exact.count()) > 0 ? exact.first() : options.filter({ hasText: value }).first()
    if ((await option.count()) === 0) {
        await page.keyboard.press("Escape")
        await expect(options).toHaveCount(0)
        return `no "${value}" option exists yet`
    }
    await option.click()
    if (await search.isVisible()) await page.keyboard.press("Escape")
    await expect(options).toHaveCount(0)

    const add = field.getByRole("button", { name: "Add", exact: true })
    if (await add.count()) await add.click()
    return
}

const MIME_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}

const uploadImage = async (page: Page, field: Locator, value: string, context: FormContext): Promise<void> => {
    const path = resolve(context.rootDir, value)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!existsSync(path)) {
        throw new Error(`Image fields need a file path relative to the project root. "${value}" was not found.`)
    }
    const mimeType = MIME_TYPES[extname(path).toLowerCase()]
    if (!mimeType) throw new Error(`"${value}" is not an image this suite can upload.`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await fileInput(field).setInputFiles({ name: basename(path), mimeType, buffer: readFileSync(path) })
    if (!context.assignsFilePermissions) return

    const dialog = page.getByRole("dialog", { name: /^Assign Permissions/ })
    await expect(dialog).toBeVisible()
    for (const selectAll of await dialog.getByRole("button", { name: "Select All", exact: true }).all()) {
        if (await selectAll.isEnabled()) await selectAll.click()
    }
    await dialog.getByRole("button", { name: /^(Apply Permissions|Upload Files)$/ }).click()
    await expect(dialog).toBeHidden()
}

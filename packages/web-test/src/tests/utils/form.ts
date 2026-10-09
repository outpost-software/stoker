import { existsSync, readFileSync } from "node:fs"
import { basename, extname, resolve } from "node:path"
import type { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import type { Locator, Page } from "@playwright/test"
import { expect, test } from "../../config/fixtures.js"
import type { StokerLocators } from "../../config/locators.js"
import type { StokerTestRecords } from "../../config/project.js"
import { openCollectionList } from "./list.js"
import { getStokerFirestore } from "@stoker-platform/node-client"
import { getTenant } from "../../initializeStoker.js"
import { updatableFieldNames } from "../../config/schema.js"

export const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/

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
    | "text"
    | "toggle"
    | "radio"
    | "buttonGroup"
    | "richText"
    | "calendar"
    | "dateTime"
    | "combobox"
    | "image"
    | "slider"
    | "readOnly"

const text = (field: Locator) => field.getByRole("textbox").or(field.getByRole("spinbutton")).first()
const toggle = (field: Locator) => field.getByRole("switch").or(field.getByRole("checkbox")).first()
const editor = (field: Locator) => field.locator(".ql-editor")
const fileInput = (field: Locator) => field.locator("input[type=file]")
const timeInput = (field: Locator) => field.locator("input[type=time]")
const dateTrigger = (field: Locator) => field.locator("button[aria-haspopup='dialog']").first()

const EDITABLE = "input, [contenteditable], [role=combobox], [role=grid], [role=switch], [role=checkbox], [role=radio]"

export const detectControl = async (field: Locator): Promise<FieldControl> => {
    if (await timeInput(field).count()) return "dateTime"
    if (await text(field).count()) return "text"
    if (await toggle(field).count()) return "toggle"
    if (await field.getByRole("radio").count()) return "radio"
    if (await editor(field).count()) {
        return (await editor(field).and(field.locator("[contenteditable='true']")).count()) ? "richText" : "readOnly"
    }
    if (await field.getByRole("grid").count()) return "calendar"
    if (await field.getByRole("combobox").count()) return "combobox"
    if (await fileInput(field).count()) return "image"
    if (await field.locator("button[aria-pressed]").count()) return "buttonGroup"
    if (await field.getByRole("slider").count()) return "slider"
    if ((await field.locator(EDITABLE).count()) === 0) return "readOnly"
    throw new Error(`${await field.innerText()} uses a control this suite cannot edit.`)
}

export interface FormContext {
    /** Project root that image paths in the test records are relative to */
    rootDir: string
    /** Whether uploading a file asks the role to assign file permissions */
    assignsFilePermissions: boolean
}

const sliderValue = async (slider: Locator) => Number(await slider.getAttribute("aria-valuenow"))

const setSlider = async (field: Locator, value: string) => {
    const target = Number(value)
    if (!Number.isFinite(target)) {
        throw new Error(`${await field.innerText()} needs a numeric slider value. "${value}" was given.`)
    }
    const slider = field.getByRole("slider")
    await slider.focus()
    await slider.press("Home")
    const min = await sliderValue(slider)
    if (target <= min) return
    await slider.press("ArrowRight")
    const step = (await sliderValue(slider)) - min
    if (step <= 0) throw new Error(`${await field.innerText()} did not move when the slider stepped.`)
    const presses = Math.round((target - min) / step) - 1
    for (let index = 0; index < presses; index++) await slider.press("ArrowRight")
    const reached = await sliderValue(slider)
    if (Math.abs(reached - target) > step / 2) {
        throw new Error(`${await field.innerText()} slider stopped at ${reached}, not ${target}.`)
    }
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
        case "dateTime":
            await pickDateTime(page, field, value)
            return
        case "combobox":
            return pickOption(page, field, value)
        case "image":
            await uploadImage(page, field, value, context)
            return
        case "slider":
            await setSlider(field, value)
            return
        case "readOnly":
            return
    }
}

export const isBlank = async (field: Locator, control: FieldControl) => {
    if (control === "text") {
        const input = field.getByRole("textbox").or(field.getByRole("spinbutton")).first()
        return (await input.inputValue()) === ""
    }
    if (control === "calendar") return (await field.locator("[aria-selected='true']").count()) === 0
    if (control === "dateTime") return (await dateTrigger(field).innerText()).trim() === "Select date"
    if (control === "combobox") {
        const text = (await field.getByRole("combobox").first().innerText()).trim()
        return text === "" || text === "----"
    }
    if (control === "buttonGroup") return (await field.locator("button[aria-pressed='true']").count()) === 0
    if (control === "radio") return (await field.getByRole("radio", { checked: true }).count()) === 0
    if (control === "richText") return (await field.locator(".ql-editor").innerText()).trim() === ""
    if (control === "image") return (await field.locator("img").count()) === 0
    return false
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
            const { year, month, day } = parseDate(value)
            const selected = field.locator("[role=grid] [aria-selected='true']")
            await expect(selected).toHaveCount(1)
            await expect(selected).toHaveText(String(day))
            expect(await gridCaption(field)).toBe(`${MONTHS[month - 1]} ${year}`)
            return
        }
        case "dateTime": {
            const { date, time } = parseDateTime(value)
            const { year, month, day } = parseDate(date)
            await expect(dateTrigger(field)).not.toHaveText("Select date")
            const shown = await dateTrigger(field).innerText()
            const numbers = (shown.match(/\d+/g) ?? []).map(Number)
            expect(numbers, `${shown} should show day ${day}`).toContain(day)
            expect(numbers.includes(year) || numbers.includes(year % 100), `${shown} should show ${year}`).toBe(true)
            expect(
                numbers.includes(month) || shown.includes(MONTHS[month - 1].slice(0, 3)),
                `${shown} should show month ${month}`,
            ).toBe(true)
            if (time) await expect(timeInput(field)).toHaveValue(time)
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
        case "slider":
            await expect.poll(async () => sliderValue(field.getByRole("slider"))).toBeCloseTo(Number(value), 5)
            return
        case "readOnly":
            return
    }
}

export interface FieldValue {
    name: string
    value: string
}

export const fieldValues = (
    fixture: StokerTestRecords[string] | undefined,
    operation?: "create" | "update",
): FieldValue[] =>
    Object.entries(fixture ?? {}).flatMap(([name, values]) => {
        const value =
            operation === "create"
                ? values.create
                : operation === "update"
                  ? values.update
                  : values.update || values.create
        if (value === undefined || (operation === undefined && value === "")) return []
        return [{ name, value }]
    })

export const updatableFieldValues = async (
    collection: CollectionSchema,
    role: string,
    entries: FieldValue[],
): Promise<FieldValue[]> => {
    const updatable = await updatableFieldNames(collection, role)
    return entries.filter(({ name }) => {
        if (updatable.has(name)) return true
        annotate(collection, name, `${role} cannot update this field`)
        return false
    })
}

export const openCreateForm = async (page: Page, ui: StokerLocators, collection: CollectionSchema): Promise<string> => {
    await openCollectionList(page, ui, collection)
    await ui.collection.addButton.click()
    await expect(ui.record.save).toBeVisible()
    return (await ui.record.form.getAttribute("data-collection")) ?? ""
}

export interface AppliedField extends FieldValue {
    control: FieldControl
}

export const fillFields = async (
    page: Page,
    scope: Page | Locator,
    collection: CollectionSchema,
    entries: FieldValue[],
    context: FormContext,
): Promise<AppliedField[]> => {
    const applied: AppliedField[] = []
    for (const { name, value } of entries) {
        const field = scope.getByTestId(`field-${name}`)
        if ((await field.count()) === 0) {
            annotate(collection, name, "not shown in this form")
            continue
        }
        const control = await detectControl(field)
        if (control === "readOnly") {
            annotate(collection, name, "read-only")
            continue
        }
        const skipped = await setField(page, field, control, value, context)
        if (skipped) {
            annotate(collection, name, skipped)
            continue
        }
        applied.push({ name, value, control })
    }
    return applied
}

export const createRecord = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    entries: FieldValue[],
    context: FormContext,
) => {
    const dialog = page.getByRole("dialog")
    await fillFields(page, dialog, collection, entries, context)
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 120000 })
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 120000 })
}

export const openedRecord = async (page: Page, collection: CollectionSchema) => {
    const parts = new URL(page.url()).pathname.split("/").filter(Boolean)
    const index = parts.findIndex((part) => part.toLowerCase() === collection.labels.collection.toLowerCase())
    const id = parts[index + 1]
    const db = getStokerFirestore()
    const tenantId = getTenant()
    const snapshot = await db.collection("tenants").doc(tenantId).collection(collection.labels.collection).doc(id).get()
    const data = snapshot.data()
    if (!data) throw new Error(`${collection.labels.collection} record ${id} was not found`)
    return { ...data, id: snapshot.id } as unknown as StokerRecord
}

const annotate = (collection: CollectionSchema, name: string, reason: string) =>
    test.info().annotations.push({
        type: "field skipped",
        description: `${collection.labels.collection}.${name}: ${reason}`,
    })

const parseDate = (value: string) => ({
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
})

const parseDateTime = (value: string) => {
    const [date, time] = value.split(/[T ]/)
    if (!DATE.test(date) || (time !== undefined && !TIME.test(time))) {
        throw new Error(`Date-time fields need a "YYYY-MM-DD HH:mm" value. "${value}" was given.`)
    }
    return { date, time }
}

export const shownDay = async (field: Locator, control: FieldControl): Promise<string[]> => {
    if (control === "calendar") {
        const selected = field.locator("[aria-selected='true']")
        await expect(selected).toHaveCount(1)
        return [(await selected.innerText()).trim()]
    }
    if (control === "dateTime") {
        await expect(dateTrigger(field)).not.toHaveText("Select date")
        return (await dateTrigger(field).innerText()).match(/\d+/g) ?? []
    }
    throw new Error(`${control} fields do not show a date.`)
}

const gridCaption = (field: Locator): Promise<string> =>
    field.getByRole("grid").evaluate((grid) => {
        const id = grid.getAttribute("aria-labelledby")
        const caption = id ? grid.ownerDocument.getElementById(id)?.textContent : grid.getAttribute("aria-label")
        return (caption ?? "").replace(/\s+/g, " ").trim()
    })

const showCaption = async (field: Locator, button: string, caption: string) => {
    const next = field.getByRole("button", { name: button })
    await expect(async () => {
        if ((await gridCaption(field)) !== caption) await next.click()
        expect(await gridCaption(field)).toBe(caption)
    }).toPass({ timeout: 8000 })
}

const pickDate = async (field: Locator, value: string): Promise<void> => {
    const { year, month, day } = parseDate(value)
    const caption = await gridCaption(field)

    if (/^\d{4}$/.test(caption)) {
        const shown = Number(caption)
        const direction = year > shown ? 1 : -1
        for (let next = shown + direction; direction * (next - year) <= 0; next += direction) {
            await showCaption(field, direction > 0 ? "Go to next year" : "Go to previous year", String(next))
        }
        await field.getByRole("gridcell", { name: MONTHS[month - 1].slice(0, 3), exact: true }).click()
        return
    }

    const [shownMonth, shownYear] = caption.split(" ")
    const target = year * 12 + month - 1
    const shown = Number(shownYear) * 12 + MONTHS.indexOf(shownMonth)
    const direction = target > shown ? 1 : -1
    for (let next = shown + direction; direction * (next - target) <= 0; next += direction) {
        await showCaption(
            field,
            direction > 0 ? "Go to next month" : "Go to previous month",
            `${MONTHS[next % 12]} ${Math.floor(next / 12)}`,
        )
    }
    await field.locator("[role=grid] button:not(.day-outside)").getByText(String(day), { exact: true }).click()
}

const pickDateTime = async (page: Page, field: Locator, value: string): Promise<void> => {
    const { date, time } = parseDateTime(value)
    const trigger = dateTrigger(field)
    await trigger.click()
    const popoverId = await trigger.getAttribute("aria-controls")
    if (!popoverId) throw new Error(`${await field.innerText()} did not open a date picker.`)
    const popover = page.locator(`[id="${popoverId}"]`)
    await expect(popover.getByRole("grid")).toBeVisible()
    await pickDate(popover, date)
    await page.keyboard.press("Escape")
    await expect(popover).toBeHidden()
    if (time) await timeInput(field).fill(time)
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

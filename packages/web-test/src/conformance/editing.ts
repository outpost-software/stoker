import type { Locator, Page } from "@playwright/test"
import type { CollectionSchema } from "@stoker-platform/types"
import { expect, test } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"
import type { StokerTestRecords } from "../project.js"
import { assignsFilePermissions, collectionPath, listableCollections, roleCanAccess } from "../schema.js"
import {
    DATE,
    detectControl,
    escapeRegExp,
    expectField,
    setField,
    type FieldControl,
    type FormContext,
} from "./form.js"
import { openList } from "./listView.js"
import { included, type ConformanceOptions } from "./options.js"

type Operation = "create" | "update"

interface FieldValue {
    name: string
    value: string
}

interface AppliedField extends FieldValue {
    control: FieldControl
}

export const editingConformance = (options: ConformanceOptions) => {
    test.describe("record editing", () => {
        test("configured records can be added and updated", async ({ page, schema, role, ui, project }) => {
            test.setTimeout(600000)
            const collections = included(listableCollections(schema, role), options)
                .filter((collection) => {
                    // eslint-disable-next-line security/detect-object-injection
                    return roleCanAccess(collection, role, "create") && project.records[collection.labels.collection]
                })
                .sort((a, b) => (a.seedOrder ?? Number.POSITIVE_INFINITY) - (b.seedOrder ?? Number.POSITIVE_INFINITY))
            test.skip(collections.length === 0, `${role} has no configured records to create`)

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    // eslint-disable-next-line security/detect-object-injection
                    const fixture = project.records[collection.labels.collection]
                    validateFixture(collection, fixture)

                    const context: FormContext = {
                        rootDir: project.rootDir,
                        assignsFilePermissions: assignsFilePermissions(collection, role),
                    }
                    const creates = fieldValues(fixture, "create")
                    const opened = await openCreateForm(page, ui, collection)
                    if (opened !== collection.labels.collection) {
                        test.info().annotations.push({
                            type: "skipped",
                            description: `${collection.labels.collection}: the add button opens the ${opened} form`,
                        })
                        const dialog = page.getByRole("dialog")
                        await dialog.getByRole("button", { name: "Close" }).click()
                        await expect(dialog).toBeHidden()
                        return
                    }
                    await createRecord(page, ui, collection, creates, context)

                    const updates = fieldValues(fixture, "update")
                    if (updates.length === 0 || !roleCanAccess(collection, role, "update")) return
                    await openCreatedRecord(page, ui, collection, creates)
                    await updateRecord(page, ui, collection, updates, context)
                })
            }
        })
    })
}

const validateFixture = (collection: CollectionSchema, fixture: StokerTestRecords[string]) => {
    // eslint-disable-next-line security/detect-object-injection
    for (const name of Object.keys(fixture)) {
        if (!collection.fields.some((field) => field.name === name)) {
            throw new Error(`"${name}" is not a field on ${collection.labels.collection}.`)
        }
    }
}

const fieldValues = (fixture: StokerTestRecords[string], operation: Operation): FieldValue[] =>
    Object.entries(fixture).flatMap(([name, values]) => {
        const value = operation === "create" ? values.create : values.update
        return value === undefined ? [] : [{ name, value }]
    })

const openCreateForm = async (page: Page, ui: StokerLocators, collection: CollectionSchema): Promise<string> => {
    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible()
    await openList(ui)
    await ui.collection.addButton.click()
    await expect(ui.record.save).toBeVisible()
    return (await ui.record.form.getAttribute("data-collection")) ?? ""
}

const createRecord = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    creates: FieldValue[],
    context: FormContext,
) => {
    const dialog = page.getByRole("dialog")
    await fillFields(page, dialog, collection, creates, context)
    await ui.record.save.click()
    await expect(dialog).toBeHidden({ timeout: 30000 })
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 30000 })
}

const updateRecord = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    updates: FieldValue[],
    context: FormContext,
) => {
    await expect(ui.record.save).toBeVisible()
    await expect(ui.record.form).toHaveAttribute("data-pending-fields", "0", { timeout: 120000 })
    const applied = await fillFields(page, page, collection, updates, context)
    if (applied.length === 0) return

    const notified = await ui.record.updated.count()
    await ui.record.save.click()
    await expect.poll(() => ui.record.updated.count(), { timeout: 30000 }).toBeGreaterThan(notified)
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 30000 })

    await page.reload()
    await expect(ui.record.save).toBeVisible({ timeout: 30000 })
    for (const { name, control, value } of applied) {
        await expectField(ui.record.field(name), control, value)
    }
}

const fillFields = async (
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

const annotate = (collection: CollectionSchema, name: string, reason: string) =>
    test.info().annotations.push({
        type: "field skipped",
        description: `${collection.labels.collection}.${name}: ${reason}`,
    })

const openCreatedRecord = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    creates: FieldValue[],
) => {
    if (await ui.collection.showAll.isVisible()) await ui.collection.showAll.check()

    const rangeField = collection.preloadCache?.range?.fields[0]
    const rangeDate = creates.find(({ name, value }) => name === rangeField && DATE.test(value))?.value
    if (rangeDate && (await ui.collection.range.label.isVisible())) {
        if (!(await ui.collection.range.previous.isVisible())) await selectMonthRange(page, ui)
        if (await ui.collection.range.previous.isVisible()) await showMonth(ui, rangeDate)
    }

    const row = ui.collection.rows.filter({ hasText: listedText(collection, creates) }).first()
    await expect(row, `${collection.labels.record} should be listed after it is created`).toBeVisible()
    await expect(row).toHaveAttribute("data-pending-fields", "0", { timeout: 120000 })
    await row.getByTestId("list-cell").first().click()
    await page.waitForURL((url) => url.pathname.toLowerCase().includes(`/${collection.labels.record.toLowerCase()}/`))
}

const listedText = (collection: CollectionSchema, creates: FieldValue[]): RegExp => {
    const strings = creates.filter(({ name }) => {
        return collection.fields.some((field) => field.name === name && field.type === "String" && !("values" in field))
    })
    // eslint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(strings.map(({ value }) => escapeRegExp(value)).join("|"))
}

const selectMonthRange = async (page: Page, ui: StokerLocators) => {
    await ui.collection.range.label.click()
    const popover = page.getByRole("dialog").filter({ has: page.getByRole("tab") })
    await expect(popover).toBeVisible()
    const monthTab = popover.getByRole("tab", { name: "Month", exact: true })
    if ((await monthTab.count()) === 0) {
        await page.keyboard.press("Escape")
        await expect(popover).toBeHidden()
        return
    }
    await monthTab.click()
    await page.keyboard.press("Escape")
    await expect(popover).toBeHidden()
    await expect(ui.collection.range.previous).toBeVisible()
}

const showMonth = async (ui: StokerLocators, date: string) => {
    const target = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
    const shownMonth = async () => {
        const label = await ui.collection.range.label.innerText()
        const shown = new Date(label.split(" - ")[0])
        return shown.getFullYear() * 12 + shown.getMonth()
    }
    const steps = target - (await shownMonth())
    const control = steps > 0 ? ui.collection.range.next : ui.collection.range.previous
    for (let step = 0; step < Math.abs(steps); step++) {
        const before = await shownMonth()
        await control.click()
        await expect.poll(shownMonth).not.toBe(before)
    }
}

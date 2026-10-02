import type { Locator, Page } from "@playwright/test"
import type { CollectionSchema } from "@stoker-platform/types"
import { expect, test } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"
import type { StokerTestRecords } from "../project.js"
import { assignsFilePermissions, listableCollections, roleCanAccess } from "../schema.js"
import { detectControl, expectField, setField, type FieldControl, type FormContext } from "./form.js"
import { openCollectionList, openListedRecord } from "./listView.js"
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
                    await openListedRecord(
                        page,
                        ui,
                        collection,
                        creates,
                        `${collection.labels.record} should be listed after it is created`,
                    )
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
    await openCollectionList(page, ui, collection)
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
    await expect(dialog).toBeHidden({ timeout: 120000 })
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
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
    await expect.poll(() => ui.record.updated.count(), { timeout: 60000 }).toBeGreaterThan(notified)
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })

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

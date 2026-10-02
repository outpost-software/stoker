import type { Page } from "@playwright/test"
import type { CollectionSchema } from "@stoker-platform/types"
import { expect, test } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"
import type { StokerTestRecords } from "../project.js"
import { assignsFilePermissions, roleCanAccess } from "../schema.js"
import {
    createRecord,
    expectField,
    fieldValues,
    fillFields,
    openCreateForm,
    type FieldValue,
    type FormContext,
} from "../utils/form.js"
import { openListedRecord } from "../utils/list.js"
import { fixtureCollections, type ConformanceOptions } from "../utils/options.js"

export const editingConformance = (options: ConformanceOptions) => {
    test.describe("record editing", () => {
        test("configured records can be added and updated", async ({ page, schema, role, ui, project }) => {
            test.setTimeout(600000)
            const collections = fixtureCollections(schema, role, project, options).filter((collection) =>
                roleCanAccess(collection, role, "create"),
            )
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

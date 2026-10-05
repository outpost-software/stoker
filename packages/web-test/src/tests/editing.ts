import type { Page } from "@playwright/test"
import type { CollectionSchema } from "@stoker-platform/types"
import { documentIds, rememberRecord } from "../config/records.js"
import { expect, test } from "../config/fixtures.js"
import type { StokerLocators } from "../config/locators.js"
import type { StokerTestRecords } from "../config/project.js"
import { assignsFilePermissions } from "../config/schema.js"
import {
    createRecord,
    escapeRegExp,
    expectField,
    fieldValues,
    fillFields,
    openCreateForm,
    type FieldValue,
    type FormContext,
} from "./utils/form.js"
import { openFixtureRecord } from "./utils/list.js"
import { fixtureCollections, type ConformanceOptions } from "../config/options.js"
import { isRelationField, roleHasOperationAccess } from "@stoker-platform/utils"

export const editingConformance = (options: ConformanceOptions) => {
    test.describe("record editing", () => {
        test("configured records can be added and updated", async ({ page, schema, role, ui, project }) => {
            test.setTimeout(600000)
            const collections = fixtureCollections(schema, role, project, options).filter((collection) =>
                roleHasOperationAccess(collection, role, "create"),
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
                    const before = await documentIds(collection)
                    await createRecord(page, ui, collection, creates, context)
                    await rememberRecord(project, collection, role, before)

                    const updates = fieldValues(fixture, "update")
                    if (updates.length === 0 || !roleHasOperationAccess(collection, role, "update")) return
                    await openFixtureRecord(page, ui, collection, project, role)
                    await updateRecord(page, ui, collection, fixture, updates, context)
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

const renamedTitle = (collection: CollectionSchema, fixture: StokerTestRecords[string], applied: FieldValue) => {
    const field = collection.fields.find((item) => item.name === applied.name)
    // eslint-disable-next-line security/detect-object-injection
    const title = fixture[collection.recordTitleField]
    if (!field || !isRelationField(field) || field.collection !== collection.labels.collection) return
    return title?.update && applied.value === title.create ? title.update : undefined
}

const updateRecord = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    fixture: StokerTestRecords[string],
    updates: FieldValue[],
    context: FormContext,
) => {
    await expect(ui.record.save).toBeVisible()
    const applied = await fillFields(page, page, collection, updates, context)
    if (applied.length === 0) return

    const notified = await ui.record.updated.count()
    await ui.record.save.click()
    await expect.poll(() => ui.record.updated.count(), { timeout: 60000 }).toBeGreaterThan(notified)
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })

    await page.reload()
    await expect(ui.record.save).toBeVisible({ timeout: 30000 })
    for (const { name, control, value } of applied) {
        const renamed = renamedTitle(collection, fixture, { name, value })
        if (renamed) {
            // eslint-disable-next-line security/detect-non-literal-regexp
            const either = new RegExp(`${escapeRegExp(value)}|${escapeRegExp(renamed)}`)
            await expect(ui.record.field(name).locator("..")).toContainText(either)
            continue
        }
        await expectField(ui.record.field(name), control, value)
    }
}

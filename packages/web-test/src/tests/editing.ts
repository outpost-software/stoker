import type { Page } from "@playwright/test"
import type { CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import { documentIds, fixtureUpdatesDisabled, rememberRecord } from "../config/records.js"
import { expect, test } from "../config/fixtures.js"
import type { StokerLocators } from "../config/locators.js"
import type { StokerProject, StokerTestRecords } from "../config/project.js"
import { assignsFilePermissions, createHidden, relationListTitle } from "../config/schema.js"
import {
    createRecord,
    escapeRegExp,
    expectField,
    fieldValues,
    fillFields,
    openCreateForm,
    openedRecord,
    updatableFieldValues,
    type FieldValue,
    type FormContext,
} from "./utils/form.js"
import { openCollectionList, openFixtureRecord } from "./utils/list.js"
import { fixtureCollections, skipCollection, type ConformanceOptions } from "../config/options.js"
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
                    if (skipCollection(options, role, collection.labels.collection)) return
                    // eslint-disable-next-line security/detect-object-injection
                    const fixture = project.records[collection.labels.collection]
                    validateFixture(collection, fixture)

                    const context: FormContext = {
                        rootDir: project.rootDir,
                        assignsFilePermissions: assignsFilePermissions(collection, role),
                    }
                    const creates = fieldValues(fixture, "create")
                    const parent = await parentRelationList(schema, collection, role)
                    const opened =
                        parent && !(await ownFormShows(page, ui, collection, parent.field))
                            ? await openCreateFormFromParent(page, ui, schema, project, role, collection, parent)
                            : await openCreateForm(page, ui, collection)
                    if (opened !== collection.labels.collection) {
                        test.info().annotations.push({
                            type: "skipped",
                            description: `${collection.labels.collection}: the add button opens the ${opened} form`,
                        })
                        await closeDialog(page)
                        return
                    }
                    const before = await documentIds(collection)
                    await createRecord(page, ui, collection, creates, context)
                    await rememberRecord(project, collection, role, before)

                    if (!roleHasOperationAccess(collection, role, "update")) return
                    const updates = await updatableFieldValues(collection, role, fieldValues(fixture, "update"))
                    if (updates.length === 0) return
                    if (await fixtureUpdatesDisabled(schema, project, collection, role)) {
                        test.info().annotations.push({
                            type: "skipped",
                            description: `${collection.labels.collection}: updates are disabled for this record`,
                        })
                        return
                    }
                    await openFixtureRecord(page, ui, collection, project, role)
                    await updateRecord(page, ui, collection, fixture, updates, context)
                })
            }
        })
    })
}

interface ParentRelationList {
    field: string
    parent: CollectionSchema
}

const parentRelationList = async (
    schema: CollectionsSchema,
    collection: CollectionSchema,
    role: string,
): Promise<ParentRelationList | undefined> => {
    for (const field of collection.fields) {
        // eslint-disable-next-line security/detect-object-injection
        if (!isRelationField(field)) continue
        // eslint-disable-next-line security/detect-object-injection
        const parentCollection = schema.collections[field.collection]
        const listed = parentCollection?.relationLists?.some(
            (relationList) =>
                relationList.collection === collection.labels.collection &&
                relationList.field === field.name &&
                (!relationList.roles || (relationList.roles as string[]).includes(role)),
        )
        if (!parentCollection || !listed) continue
        if (await createHidden(schema, collection, parentCollection)) continue
        return { field: field.name, parent: parentCollection }
    }
    return undefined
}

const closeDialog = async (page: Page) => {
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
}

const ownFormShows = async (page: Page, ui: StokerLocators, collection: CollectionSchema, field: string) => {
    await openCollectionList(page, ui, collection)
    if (!(await ui.collection.addButton.isVisible())) return false
    await ui.collection.addButton.click()
    await expect(ui.record.save).toBeVisible()
    const shown = (await page.getByRole("dialog").getByTestId(`field-${field}`).count()) > 0
    await closeDialog(page)
    return shown
}

const openCreateFormFromParent = async (
    page: Page,
    ui: StokerLocators,
    schema: CollectionsSchema,
    project: StokerProject,
    role: string,
    collection: CollectionSchema,
    { parent }: ParentRelationList,
): Promise<string> => {
    await openFixtureRecord(page, ui, parent, project, role)
    const record = await openedRecord(page, parent)
    const title = await relationListTitle(schema, collection, parent, record, collection.labels.collection)
    const sidebar = page.getByRole("list").filter({
        has: page.getByRole("button", { name: "Details", exact: true }),
    })
    await sidebar.getByRole("button", { name: title, exact: true }).click()
    await expect(ui.collection.table.or(ui.collection.empty).first()).toBeVisible()
    await ui.collection.addButton.click()
    const addNew = page.getByRole("menuitem", { name: "Add new", exact: true })
    const dialog = page.getByRole("dialog")
    await expect(addNew.or(dialog).first()).toBeVisible()
    if (await addNew.isVisible()) await addNew.click()
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeVisible()
    return (await dialog.getByTestId("record-form").getAttribute("data-collection")) ?? ""
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

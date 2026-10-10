import type { Assignable, CollectionSchema, CollectionsSchema, RelationList } from "@stoker-platform/types"
import type { Page } from "@playwright/test"
import { canUpdateField, isRelationField, roleHasOperationAccess, tryPromise } from "@stoker-platform/utils"
import { expect, test } from "../config/fixtures.js"
import type { StokerLocators } from "../config/locators.js"
import type { StokerProject } from "../config/project.js"
import { assignsFilePermissions, distinctValue, isUnique, relationListTitle } from "../config/schema.js"
import { createRecord, fieldValues, openCreateForm, openedRecord, type FormContext } from "./utils/form.js"
import { openFixtureRecord } from "./utils/list.js"
import { fixtureCollections, skipCollection, type ConformanceOptions } from "../config/options.js"
import { getCustomizationFile } from "@stoker-platform/node-client"
import { getCurrentUser, getCurrentUserPermissions } from "../initializeStoker.js"

interface Assignment {
    parent: CollectionSchema
    related: CollectionSchema
    relationList: RelationList
}

export const assignableConformance = (options: ConformanceOptions) => {
    test.describe("assignable", () => {
        test("a record can be assigned from a relation list", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const assignments = await assignmentsFor(schema, role, project, options)
            test.skip(assignments.length === 0, `${role} has no assignable relation list`)
            test.setTimeout(Math.max(300000, assignments.length * 300000))

            for (const assignment of assignments) {
                await test.step(`${assignment.parent.labels.collection} ${assignment.related.labels.collection}`, async () => {
                    if (skipCollection(options, role, assignment.parent.labels.collection)) return
                    await assignRecord(page, ui, project, schema, assignment, role)
                })
            }
        })
    })
}

const assignmentsFor = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
) => {
    const collections = fixtureCollections(schema, role, project, options)
    const assignments: Assignment[] = []
    for (const parent of collections) {
        const customization = await getCustomizationFile(parent.labels.collection, schema)
        const assignable = (await tryPromise(customization.admin?.assignable)) as Assignable[] | undefined
        for (const item of assignable ?? []) {
            const relationList = parent.relationLists?.find((list) => list.collection === item.collection)
            // eslint-disable-next-line security/detect-object-injection
            const related = schema.collections[item.collection]
            if (!relationList || !related || !roleHasOperationAccess(related, role, "read")) continue
            if (relationList.roles && !relationList.roles.includes(role)) continue
            const field = related.fields.find((entry) => entry.name === relationList.field)
            if (!field || !isRelationField(field)) continue
            // eslint-disable-next-line security/detect-object-injection
            if (!project.records[related.labels.collection]) continue
            const user = await getCurrentUser(role)
            const permissions = await getCurrentUserPermissions(role)
            if (!canUpdateField(related, field, permissions, user.customClaims ?? {})) continue
            assignments.push({ parent, related, relationList })
        }
    }
    return assignments
}

const assignRecord = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    schema: CollectionsSchema,
    assignment: Assignment,
    role: string,
) => {
    // eslint-disable-next-line security/detect-object-injection
    const fixture = project.records[assignment.related.labels.collection]

    const context: FormContext = {
        rootDir: project.rootDir,
        assignsFilePermissions: assignsFilePermissions(assignment.related, role),
    }
    const canCreate = roleHasOperationAccess(assignment.related, role, "create")
    if (canCreate) {
        const creates = fieldValues(fixture, "create").map((item) => {
            const field = assignment.related.fields.find((entry) => entry.name === item.name)
            return field && isUnique(field) ? { ...item, value: distinctValue(field, item.value, "Assign", 2) } : item
        })
        await openCreateForm(page, ui, assignment.related)
        await createRecord(page, ui, assignment.related, creates, context)
    }
    await openFixtureRecord(page, ui, assignment.parent, project, role)
    const record = await openedRecord(page, assignment.parent)
    const title = await relationListTitle(
        schema,
        assignment.related,
        assignment.parent,
        record,
        assignment.relationList.collection,
    )
    const sidebar = page.getByRole("list").filter({
        has: page.getByRole("button", { name: "Details", exact: true }),
    })
    await sidebar.getByRole("button", { name: title, exact: true }).click()
    const startAssigning = sidebar.getByTestId("start-assigning").filter({ visible: true })
    await expect(startAssigning).toBeVisible()
    await startAssigning.click()
    const images = await imagesTitle(schema, assignment.related)
    const tab = page.getByRole("tab", { name: images, exact: true })
    if (await tab.isVisible()) await tab.click()
    const assigned = page.getByRole("switch", { name: "Assigned", exact: true })
    await expect(assigned.first()).toBeVisible({ timeout: 30000 })
    const unchecked = assigned.and(page.locator("[data-state='unchecked']"))
    const source = unchecked.first()
    const card = source.locator("xpath=ancestor::div[contains(@class,'bg-card')][1]")
    const recordTitle = (await card.getByRole("heading").innerText()).trim()
    await source.click()
    const toggle = page
        .getByRole("heading", { name: recordTitle, exact: true })
        .locator("xpath=ancestor::div[contains(@class,'bg-card')][1]")
        .getByRole("switch", { name: "Assigned", exact: true })
    await expect(toggle).toHaveAttribute("data-state", "checked")
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    await sidebar.getByTestId("stop-assigning").filter({ visible: true }).click()
    const assignedRecord = page.getByRole("heading", { name: recordTitle, exact: true })
    await expect(assignedRecord).toBeVisible({ timeout: 30000 })
    await startAssigning.click()
    await toggle.click()
    await expect(toggle).toHaveAttribute("data-state", "unchecked")
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    await sidebar.getByTestId("stop-assigning").filter({ visible: true }).click()
    await expect(startAssigning).toBeVisible()
    await expect(assignedRecord).toBeHidden()
}

const imagesTitle = async (schema: CollectionsSchema, collection: CollectionSchema) => {
    const customization = await getCustomizationFile(collection.labels.collection, schema)
    const images = (await tryPromise(customization.admin?.images)) as { title?: string } | undefined
    return images?.title || "Pics"
}

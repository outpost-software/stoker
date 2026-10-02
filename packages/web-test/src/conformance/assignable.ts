import type { Assignable, CollectionSchema, CollectionsSchema, RelationList } from "@stoker-platform/types"
import type { Page } from "@playwright/test"
import { isRelationField, tryPromise } from "@stoker-platform/utils"
import { expect, test } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"
import type { StokerProject } from "../project.js"
import { assignsFilePermissions, customizationFile, relationListTitle, roleCanAccess } from "../schema.js"
import { createRecord, fieldValues, openCreateForm, openedRecord, type FormContext } from "../utils/form.js"
import { openFixtureRecord } from "../utils/list.js"
import { fixtureCollections, type ConformanceOptions } from "../utils/options.js"

interface Assignment {
    parent: CollectionSchema
    related: CollectionSchema
    relationList: RelationList
}

export const assignableConformance = (options: ConformanceOptions) => {
    test.describe("assignable", () => {
        test("a record can be assigned from a relation list", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const assignments = await assignmentsFor(schema, role, project, options)
            test.skip(assignments.length === 0, `${role} has no assignable relation list`)
            test.setTimeout(Math.max(300000, assignments.length * 300000))

            for (const assignment of assignments) {
                await test.step(`${assignment.parent.labels.collection} ${assignment.related.labels.collection}`, async () => {
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
        const customization = await customizationFile(project, schema, parent.labels.collection)
        const assignable = (await tryPromise(customization.admin?.assignable)) as Assignable[] | undefined
        for (const item of assignable ?? []) {
            const relationList = parent.relationLists?.find((list) => list.collection === item.collection)
            // eslint-disable-next-line security/detect-object-injection
            const related = schema.collections[item.collection]
            if (!relationList || !related || !roleCanAccess(related, role, "read")) continue
            if (relationList.roles && !relationList.roles.includes(role)) continue
            const field = related.fields.find((entry) => entry.name === relationList.field)
            if (!field || !isRelationField(field)) continue
            // eslint-disable-next-line security/detect-object-injection
            if (!project.records[related.labels.collection]) continue
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
    const creates = fieldValues(fixture, "create")
    await openCreateForm(page, ui, assignment.related)
    await createRecord(page, ui, assignment.related, creates, context)
    await openFixtureRecord(page, ui, assignment.parent, project)
    const record = await openedRecord(page, project, assignment.parent)
    const title = await relationListTitle(
        project,
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
    const images = await imagesTitle(project, schema, assignment.related)
    const tab = page.getByRole("tab", { name: images, exact: true })
    if (await tab.isVisible()) await tab.click()
    const assigned = page.getByRole("switch", { name: "Assigned", exact: true })
    await expect(assigned.first()).toBeVisible({ timeout: 30000 })
    const unchecked = assigned.and(page.locator("[data-state='unchecked']"))
    const source = (await unchecked.count()) > 0 ? unchecked.first() : assigned.first()
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
    await expect(startAssigning).toBeVisible()
    await expect(page.getByRole("heading", { name: recordTitle, exact: true })).toBeVisible({ timeout: 30000 })
}

const imagesTitle = async (project: StokerProject, schema: CollectionsSchema, collection: CollectionSchema) => {
    const customization = await customizationFile(project, schema, collection.labels.collection)
    const images = (await tryPromise(customization.admin?.images)) as { title?: string } | undefined
    return images?.title || "Pics"
}

import type { CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import type { Page } from "@playwright/test"
import { expect, test } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"
import type { StokerProject } from "../project.js"
import { collectionPath, listableCollections, roleCanAccess } from "../schema.js"
import { openList, selectMonthRange, setFiltersToAll, showMonth } from "./listView.js"
import { included, type ConformanceOptions } from "./options.js"
import { emulatorFirestore } from "../emulator.js"

export const collectionConformance = (options: ConformanceOptions) => {
    test.describe("collection pages", () => {
        test("search all opens a record", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = createdCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no searchable record from editing`)

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    const title = await createdRecordTitle(project, collection)
                    await openFromSearch(page, ui, collection, title)
                })
            }
        })

        test("search opens a record", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = createdCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no searchable record from editing`)

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    const title = await createdRecordTitle(project, collection)
                    const month = await createdRecordMonth(project, collection)
                    await expectInListSearch(page, ui, collection, title, month)
                })
            }
        })

        test("every readable collection renders its list", async ({ page, schema, role, ui }) => {
            const collections = included(listableCollections(schema, role), options)
            test.skip(collections.length === 0, `${role} cannot read any collection`)

            const errors: string[] = []
            page.on("pageerror", (error) => errors.push(error.message))

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await page.goto(collectionPath(collection))
                    await expect(ui.collection.heading).toBeVisible()
                    await openList(ui)
                    await expect(ui.app.errorPage).toBeHidden()
                })
            }

            expect(errors, "web-app raised uncaught errors while rendering list pages").toEqual([])
        })
    })
}

const createdCollections = (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
): CollectionSchema[] =>
    included(listableCollections(schema, role), options)
        .filter((collection) => {
            // eslint-disable-next-line security/detect-object-injection
            return (
                !!collection.fullTextSearch?.length &&
                roleCanAccess(collection, role, "create") &&
                project.records[collection.labels.collection]
            )
        })
        .sort((a, b) => (a.seedOrder ?? Number.POSITIVE_INFINITY) - (b.seedOrder ?? Number.POSITIVE_INFINITY))

const createdRecord = async (project: StokerProject, collection: CollectionSchema) => {
    const firestore = await emulatorFirestore(project)
    const snapshot = await firestore.collection(collection.labels.collection).get()
    return snapshot.docs[0]
}

const createdRecordTitle = async (project: StokerProject, collection: CollectionSchema): Promise<string> => {
    const record = await createdRecord(project, collection)
    return record?.get(collection.recordTitleField)
}

const createdRecordMonth = async (
    project: StokerProject,
    collection: CollectionSchema,
): Promise<string | undefined> => {
    const rangeField = collection.preloadCache?.range?.fields[0]
    if (!rangeField) return
    const record = await createdRecord(project, collection)
    const value = record?.get(rangeField) as { toDate?: () => Date } | undefined
    const date = value?.toDate?.()
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
}

const expectInListSearch = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    title: string,
    month?: string,
) => {
    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible()
    await openList(ui)
    if (await ui.collection.showAll.isVisible()) await ui.collection.showAll.check()
    await setFiltersToAll(page)
    if (month && (await ui.collection.range.label.isVisible())) {
        if (!(await ui.collection.range.previous.isVisible())) await selectMonthRange(page, ui)
        if (await ui.collection.range.previous.isVisible()) await showMonth(ui, month)
    }
    await ui.collection.search.fill(title)
    const row = ui.collection.rows.first()
    await expect(row, `${collection.labels.record} "${title}" should appear in the list`).toBeVisible({
        timeout: 30000,
    })
}

const openFromSearch = async (page: Page, ui: StokerLocators, collection: CollectionSchema, title: string) => {
    await page.goto("/")
    await expect(ui.app.search).toBeVisible()
    await ui.app.search.fill(title)
    const result = page.getByRole("dialog").getByRole("cell", { name: title, exact: true }).first()
    await expect(result, `${collection.labels.record} "${title}" should appear in Search all`).toBeVisible({
        timeout: 30000,
    })
    await result.click()
    const recordSegment = `/${collection.labels.record.toLowerCase()}/`
    await page.waitForURL((url) => url.pathname.toLowerCase().includes(recordSegment))
    await expect(ui.record.heading).toBeVisible()
    await expect(ui.app.errorPage).toBeHidden()
}

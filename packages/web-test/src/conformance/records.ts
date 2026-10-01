import type {
    CollectionCustomization,
    CollectionSchema,
    CollectionsSchema,
    Convert,
    StokerRecord,
} from "@stoker-platform/types"
import type { Locator, Page } from "@playwright/test"
import { isRelationField, tryPromise } from "@stoker-platform/utils"
import { expect, test } from "../fixtures.js"
import { emulatorFirestore } from "../emulator.js"
import type { StokerLocators } from "../locators.js"
import type { StokerProject, StokerTestField, StokerTestRecords } from "../project.js"
import {
    assignsFilePermissions,
    collectionPath,
    customizationFile,
    listableCollections,
    roleCanAccess,
} from "../schema.js"
import { DATE, detectControl, escapeRegExp, isBlank, setField, type FormContext } from "./form.js"
import { openList, selectMonthRange, setFiltersToAll, showMonth } from "./listView.js"
import { included, type ConformanceOptions } from "./options.js"

interface FieldValue {
    name: string
    value: string
}

export const recordConformance = (options: ConformanceOptions) => {
    test.describe("record pages", () => {
        test("a record can be duplicated", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = await withAdmin(schema, role, project, options, async (customization) => {
                return !!(await tryPromise(customization.admin?.duplicate))
            })
            test.skip(collections.length === 0, `${role} has no collection that can duplicate a record`)
            test.setTimeout(Math.max(180000, collections.length * 180000))

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await duplicateRecord(page, ui, project, schema, collection, role)
                })
            }
        })

        test("relation lists appear on the record page", async ({ page, schema, role, ui, project }) => {
            const collections = included(listableCollections(schema, role), options).sort(
                (a, b) => (a.seedOrder ?? Number.POSITIVE_INFINITY) - (b.seedOrder ?? Number.POSITIVE_INFINITY),
            )
            const visible = collections.filter(
                (collection) => relevantRelationLists(schema, role, collection).length > 0,
            )
            test.skip(visible.length === 0, `${role} has no relation lists on a record page`)
            test.setTimeout(Math.max(120000, visible.length * 60000))

            for (const collection of visible) {
                await test.step(collection.labels.collection, async () => {
                    // eslint-disable-next-line security/detect-object-injection
                    if (project.records[collection.labels.collection]) {
                        await openFixtureRecord(page, ui, collection, project)
                    } else if (!(await openFirstRecord(page, ui, collection))) {
                        test.info().annotations.push({
                            type: "skipped",
                            description: `${collection.labels.collection}: no record to open`,
                        })
                        return
                    }
                    const record = await openedRecord(page, project, collection)
                    const titles = await relationListTitles(schema, role, project, collection, record)
                    const sidebar = page.getByRole("list").filter({
                        has: page.getByRole("button", { name: "Details", exact: true }),
                    })
                    await expect(sidebar).toBeVisible()
                    for (const title of titles) {
                        await expect(sidebar.getByRole("button", { name: title, exact: true })).toBeVisible()
                    }
                })
            }
        })

        test("a record can be converted", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const conversions = await conversionsFor(schema, role, project, options)
            test.skip(conversions.length === 0, `${role} has no collection that can convert a record`)
            test.setTimeout(Math.max(180000, conversions.length * 180000))

            for (const { source, target } of conversions) {
                await test.step(`${source.labels.collection} to ${target.labels.collection}`, async () => {
                    await convertRecord(page, ui, project, schema, source, target, role)
                })
            }
        })
    })
}

const withAdmin = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
    include: (customization: Awaited<CollectionCustomization>) => Promise<boolean>,
) => {
    const collections = included(listableCollections(schema, role), options)
        .filter((collection) => {
            // eslint-disable-next-line security/detect-object-injection
            return roleCanAccess(collection, role, "create") && project.records[collection.labels.collection]
        })
        .sort((a, b) => (a.seedOrder ?? Number.POSITIVE_INFINITY) - (b.seedOrder ?? Number.POSITIVE_INFINITY))
    const matched: CollectionSchema[] = []
    for (const collection of collections) {
        const customization = await customizationFile(project, schema, collection.labels.collection)
        if (await include(customization)) matched.push(collection)
    }
    return matched
}

const conversionsFor = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
) => {
    const sources = await withAdmin(schema, role, project, options, async (customization) => {
        const convert = (await tryPromise(customization.admin?.convert)) as Convert[] | undefined
        return !!convert?.some((item) => !item.roles || item.roles.includes(role))
    })
    const conversions: { source: CollectionSchema; target: CollectionSchema }[] = []
    for (const source of sources) {
        const customization = await customizationFile(project, schema, source.labels.collection)
        const convert = (await tryPromise(customization.admin?.convert)) as Convert[] | undefined
        for (const item of convert ?? []) {
            if (item.roles && !item.roles.includes(role)) continue
            // eslint-disable-next-line security/detect-object-injection
            const target = schema.collections[item.collection]
            if (!target || !roleCanAccess(target, role, "create")) continue
            conversions.push({ source, target })
        }
    }
    return conversions
}

const duplicateRecord = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    schema: CollectionsSchema,
    collection: CollectionSchema,
    role: string,
) => {
    const before = await recordCount(project, collection.labels.collection)
    await openFixtureRecord(page, ui, collection, project)
    await expect(ui.record.form).toHaveAttribute("data-pending-fields", "0", { timeout: 120000 })
    await page.getByRole("button", { name: "Duplicate", exact: true }).click()
    const title = await recordTitle(project, schema, collection)
    const dialog = page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: `Create ${title}`, exact: true }),
    })
    await expect(dialog).toBeVisible()
    // eslint-disable-next-line security/detect-object-injection
    await prepareCopy(page, dialog, collection, project.records[collection.labels.collection], {
        rootDir: project.rootDir,
        assignsFilePermissions: assignsFilePermissions(collection, role),
    })
    await saveCopy(ui, dialog)
    await expect.poll(() => recordCount(project, collection.labels.collection), { timeout: 60000 }).toBe(before + 1)
}

const convertRecord = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    schema: CollectionsSchema,
    source: CollectionSchema,
    target: CollectionSchema,
    role: string,
) => {
    const before = await recordCount(project, target.labels.collection)
    const sourceCount = await recordCount(project, source.labels.collection)
    await openFixtureRecord(page, ui, source, project)
    await expect(ui.record.form).toHaveAttribute("data-pending-fields", "0", { timeout: 120000 })
    await page.getByRole("button", { name: "Convert", exact: true }).click()
    const title = await recordTitle(project, schema, target)
    await page.getByRole("menuitem", { name: title, exact: true }).click()
    const dialog = page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: `Convert to ${title}`, exact: true }),
    })
    await expect(dialog).toBeVisible()
    // eslint-disable-next-line security/detect-object-injection
    const fixture = project.records[target.labels.collection]
    if (fixture) {
        await prepareCopy(page, dialog, target, fixture, {
            rootDir: project.rootDir,
            assignsFilePermissions: assignsFilePermissions(target, role),
        })
    }
    await saveCopy(ui, dialog)
    await expect.poll(() => recordCount(project, target.labels.collection), { timeout: 60000 }).toBe(before + 1)
    await expect.poll(() => recordCount(project, source.labels.collection)).toBe(sourceCount)
}

const relevantRelationLists = (schema: CollectionsSchema, role: string, collection: CollectionSchema) =>
    (collection.relationLists ?? []).filter((relationList) => {
        // eslint-disable-next-line security/detect-object-injection
        const related = schema.collections[relationList.collection]
        if (!related || !roleCanAccess(related, role, "read")) return false
        const field = related.fields.find((item) => item.name === relationList.field)
        if (!field || !isRelationField(field)) return false
        if (relationList.roles && !relationList.roles.includes(role)) return false
        return true
    })

const relationListTitles = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    collection: CollectionSchema,
    record: StokerRecord,
) => {
    const titles: string[] = []
    for (const relationList of relevantRelationLists(schema, role, collection)) {
        // eslint-disable-next-line security/detect-object-injection
        const related = schema.collections[relationList.collection]
        if (!related) continue
        const customization = await customizationFile(project, schema, related.labels.collection)
        const configured = await tryPromise(customization.admin?.titles, ["relation-list", collection, record])
        titles.push(configured?.collection || relationList.collection)
    }
    return titles
}

const openedRecord = async (page: Page, project: StokerProject, collection: CollectionSchema) => {
    const parts = new URL(page.url()).pathname.split("/").filter(Boolean)
    const index = parts.findIndex((part) => part.toLowerCase() === collection.labels.collection.toLowerCase())
    const id = parts[index + 1]
    const firestore = await emulatorFirestore(project)
    const snapshot = await firestore.collection(collection.labels.collection).doc(id).get()
    return { id: snapshot.id, ...snapshot.data() } as unknown as StokerRecord
}

const openFirstRecord = async (page: Page, ui: StokerLocators, collection: CollectionSchema) => {
    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible()
    await openList(ui)
    if (await ui.collection.showAll.isVisible()) await ui.collection.showAll.check()
    await setFiltersToAll(page)
    if (await ui.collection.empty.isVisible()) return false
    await ui.collection.rows.first().getByTestId("list-cell").first().click()
    await page.waitForURL((url) => url.pathname.toLowerCase().includes(`/${collection.labels.record.toLowerCase()}/`))
    await expect(ui.record.heading).toBeVisible()
    return true
}

const recordTitle = async (project: StokerProject, schema: CollectionsSchema, collection: CollectionSchema) => {
    const customization = await customizationFile(project, schema, collection.labels.collection)
    const titles = await tryPromise(customization.admin?.titles)
    return titles?.record || collection.labels.record
}

const openFixtureRecord = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    project: StokerProject,
) => {
    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible()
    await openList(ui)
    if (await ui.collection.showAll.isVisible()) await ui.collection.showAll.check()
    await setFiltersToAll(page)
    // eslint-disable-next-line security/detect-object-injection
    const entries = fixtureEntries(project.records[collection.labels.collection])
    const rangeField = collection.preloadCache?.range?.fields[0]
    const rangeDate = entries.find(({ name, value }) => name === rangeField && DATE.test(value))?.value
    if (rangeDate && (await ui.collection.range.label.isVisible())) {
        if (!(await ui.collection.range.previous.isVisible())) await selectMonthRange(page, ui)
        if (await ui.collection.range.previous.isVisible()) await showMonth(ui, rangeDate)
    }
    const row = ui.collection.rows
        .filter({ hasText: listedText(collection, entries) })
        .filter({ hasNotText: "Calendar" })
        .first()
    await expect(row, `${collection.labels.record} from the fixture should be listed`).toBeVisible()
    await expect(row).toHaveAttribute("data-pending-fields", "0", { timeout: 120000 })
    await row.getByTestId("list-cell").first().click()
    await page.waitForURL((url) => url.pathname.toLowerCase().includes(`/${collection.labels.record.toLowerCase()}/`))
    await expect(ui.record.heading).toBeVisible()
}

const prepareCopy = async (
    page: Page,
    dialog: Locator,
    collection: CollectionSchema,
    fixture: StokerTestRecords[string],
    context: FormContext,
) => {
    for (const { name, value } of fixtureEntries(fixture)) {
        const field = dialog.getByTestId(`field-${name}`)
        if ((await field.count()) === 0) continue
        const control = await detectControl(field)
        if (control === "readOnly") continue
        const schemaField = collection.fields.find((item) => item.name === name)
        const unique = !!schemaField && "unique" in schemaField && schemaField.unique === true
        const required = !!schemaField && "required" in schemaField && schemaField.required === true
        if (control === "text" && unique) {
            const input = field.getByRole("textbox").or(field.getByRole("spinbutton")).first()
            const current = await input.inputValue()
            if (current === "" || current === value) {
                if (schemaField?.type === "String" && schemaField.email) {
                    await setField(page, field, control, `copy-${value}`, context)
                } else if (schemaField?.type === "Number") {
                    await setField(page, field, control, `${Number(value) + 1}`, context)
                } else {
                    await setField(page, field, control, `${value} Copy`, context)
                }
            }
            continue
        }
        if (required && (await isBlank(field, control))) await setField(page, field, control, value, context)
    }
}

const saveCopy = async (ui: StokerLocators, dialog: Locator) => {
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 120000 })
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    await expect(ui.record.heading).toBeVisible()
    await expect(ui.app.errorPage).toBeHidden()
}

const fixtureEntries = (fixture: StokerTestRecords[string] | undefined): FieldValue[] =>
    Object.entries(fixture ?? {}).flatMap(([name, field]) => {
        const value = fixtureValue(field)
        return value ? [{ name, value }] : []
    })

const fixtureValue = (field: StokerTestField) => field.update || field.create

const listedText = (collection: CollectionSchema, entries: FieldValue[]): RegExp => {
    const strings = entries.filter(({ name }) => {
        return collection.fields.some((field) => field.name === name && field.type === "String" && !("values" in field))
    })
    // eslint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(strings.map(({ value }) => escapeRegExp(value)).join("|"))
}

const recordCount = async (project: StokerProject, collection: string) => {
    const firestore = await emulatorFirestore(project)
    const snapshot = await firestore.collection(collection).get()
    return snapshot.size
}

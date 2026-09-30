import type {
    CardsConfig,
    CollectionCustomization,
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    Filter,
} from "@stoker-platform/types"
import type { Locator, Page } from "@playwright/test"
import { updateRecord } from "@stoker-platform/node-client"
import { isRelationField, tryFunction, tryPromise } from "@stoker-platform/utils"
import { expect, test } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"
import type { StokerProject } from "../project.js"
import { collectionPath, customizationFile, listableCollections, roleCanAccess } from "../schema.js"
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

        test("AI chat responds", async ({ page, schema, role, ui }) => {
            const collections = chatCollections(schema, role, options)
            test.skip(collections.length === 0, `${role} has no AI chat`)
            test.setTimeout(collections.length * 90000)

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await expectChatReply(page, ui, collection)
                })
            }
        })

        test("all filters are present", async ({ page, schema, role, ui, project }) => {
            const collections = await collectionsWithFilters(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no filters`)

            for (const { collection, filters, status } of collections) {
                await test.step(collection.labels.collection, async () => {
                    await expectFilters(page, ui, collection, filters, status)
                })
            }
        })

        test("export button works or is disabled", async ({ page, schema, role, ui, project }) => {
            const collections = included(listableCollections(schema, role), options)
            test.skip(collections.length === 0, `${role} cannot read any collection`)
            test.setTimeout(Math.max(120000, collections.length * 30000))

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await expectExport(page, ui, project, schema, collection, role)
                })
            }
        })

        test("board card moves one column", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = await boardCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no board with a created record`)
            test.setTimeout(Math.max(120000, collections.length * 60000))

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await expectBoardMove(page, ui, project, schema, collection, role)
                })
            }
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

const chatCollections = (schema: CollectionsSchema, role: string, options: ConformanceOptions): CollectionSchema[] =>
    included(listableCollections(schema, role), options)
        .filter((collection) => !!collection.ai?.chat && collection.ai.chat.roles.includes(role))
        .sort((a, b) => (a.seedOrder ?? Number.POSITIVE_INFINITY) - (b.seedOrder ?? Number.POSITIVE_INFINITY))

interface VisibleFilter {
    label: string
    options?: string[]
    style?: "select" | "radio" | "buttons"
}

interface StatusField {
    field: string
    active?: unknown[]
    archived?: unknown[]
}

const statusRadioName = (option: string): string => {
    if (option === "Active") return "Toggle active"
    if (option === "Archived") return "Toggle archived"
    if (option === "Trash") return "Toggle trash"
    return "Toggle all"
}

const statusOptions = (statusField: StatusField | undefined, collection: CollectionSchema): string[] => {
    if (!statusField && !collection.softDelete) return []
    const options: string[] = []
    if (statusField?.active) options.push("Active")
    if (statusField?.archived) options.push("Archived")
    options.push("All")
    if (collection.softDelete) options.push("Trash")
    return options
}

const filterTitle = (filter: Filter, field: CollectionField, customization: CollectionCustomization): string => {
    const title = "title" in filter ? tryFunction(filter.title) : undefined
    const label = tryFunction(customization.fields.find((item) => item.name === field.name)?.admin?.label)
    return title || label || field.name
}

const selectValues = (field: CollectionField, title: string): (string | number)[] => {
    if (field.type === "Boolean") return [title, `Not ${title}`]
    if (!("values" in field) || !field.values) return []
    if (field.type === "Number") return field.values.map((value) => value.toString())
    return field.values
}

const displayedOptions = (
    filter: Extract<Filter, { type: "select" }>,
    field: CollectionField,
    title: string,
): string[] => {
    const shown = selectValues(field, title)
        .filter((value) => !filter.filterValues || filter.filterValues(value) !== false)
        .map((value) => String(filter.titles ? filter.titles(value as string) : value))
    if (filter.style === "radio" || filter.style === "buttons") return [...shown, "All"]
    return ["----", ...shown]
}

const visibleFilters = async (
    customization: CollectionCustomization,
    collection: CollectionSchema,
    schema: CollectionsSchema,
    role: string,
    statusField?: string,
): Promise<VisibleFilter[]> => {
    const visible: VisibleFilter[] = []
    const filters: Filter[] | undefined = await tryPromise(customization.admin?.filters)
    for (const filter of filters ?? []) {
        if (filter.type === "status" || filter.type === "range") continue
        // A filter on the status field is replaced by the Active / Archived radios.
        if (statusField && filter.field === statusField) continue
        if ("condition" in filter && typeof filter.condition === "function" && filter.condition() === false) continue
        if (filter.roles && !filter.roles.includes(role)) continue
        const field = collection.fields.find((item) => item.name === filter.field)
        if (!field) continue
        if (filter.type === "select" && field.type !== "Boolean" && !("values" in field && field.values)) continue
        if (filter.type === "relation") {
            if (!isRelationField(field)) continue
            // eslint-disable-next-line security/detect-object-injection
            const target = schema.collections[field.collection]
            if (!target?.fullTextSearch || !roleCanAccess(target, role, "read")) continue
        }
        const title = filterTitle(filter, field, customization)
        const entry: VisibleFilter = { label: `${title}:` }
        if (filter.type === "select") {
            entry.options = displayedOptions(filter, field, title)
            entry.style = filter.style ?? "select"
        }
        visible.push(entry)
    }
    return visible
}

const collectionsWithFilters = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
): Promise<{ collection: CollectionSchema; filters: VisibleFilter[]; status: string[] }[]> => {
    const collections = included(listableCollections(schema, role), options).sort(
        (a, b) => (a.seedOrder ?? Number.POSITIVE_INFINITY) - (b.seedOrder ?? Number.POSITIVE_INFINITY),
    )
    const visible: { collection: CollectionSchema; filters: VisibleFilter[]; status: string[] }[] = []
    for (const collection of collections) {
        const customization = await customizationFile(project, schema, collection.labels.collection)
        const statusField = (await tryPromise(customization.admin?.statusField)) as StatusField | undefined
        const filters = await visibleFilters(customization, collection, schema, role, statusField?.field)
        const status = statusOptions(statusField, collection)
        if (filters.length > 0 || status.length > 0) visible.push({ collection, filters, status })
    }
    return visible
}

const expectStatus = async (page: Page, collection: CollectionSchema, options: string[]) => {
    const group = page.getByRole("radiogroup").filter({
        has: page.getByRole("radio", { name: "Toggle all", exact: true }),
    })
    const message = `${collection.labels.collection} should show ${options.join(", ")}`
    await expect(group.getByRole("radio"), message).toHaveCount(options.length)
    for (const option of options) {
        const radio = group.getByRole("radio", { name: statusRadioName(option), exact: true })
        await expect(radio, `${collection.labels.collection} should show ${option}`).toBeVisible()
        await expect(radio).toHaveText(option)
    }
}

const expectChoices = async (
    root: Locator,
    role: "radio" | "button" | "option",
    options: string[],
    collectionName: string,
    label: string,
) => {
    const message = `${collectionName} ${label} should show ${options.join(", ")}`
    await expect(root.getByRole(role), message).toHaveCount(options.length)
    for (const option of options) {
        const choice =
            role === "radio"
                ? root.getByText(option, { exact: true }).first()
                : root.getByRole(role, { name: option, exact: true }).first()
        await choice.scrollIntoViewIfNeeded()
        await expect(choice, `${collectionName} ${label} should show ${option}`).toBeVisible()
    }
}

const expectFilterOptions = async (page: Page, label: Locator, filter: VisibleFilter, collectionName: string) => {
    if (!filter.options || !filter.style) return
    const block = label.locator("..")
    if (filter.style === "radio") {
        await expectChoices(block, "radio", filter.options, collectionName, filter.label)
        return
    }
    if (filter.style === "buttons") {
        await expectChoices(block, "button", filter.options, collectionName, filter.label)
        return
    }
    const trigger = block.getByRole("combobox")
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    const listbox = page.getByRole("listbox")
    await expect(listbox).toBeVisible()
    await expectChoices(listbox, "option", filter.options, collectionName, filter.label)
    await page.keyboard.press("Escape")
    await expect(listbox).toBeHidden()
}

const expectFilters = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    filters: VisibleFilter[],
    status: string[],
) => {
    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible()
    await openList(ui)
    if (status.length > 0) await expectStatus(page, collection, status)
    if (filters.length === 0) return
    await page.getByRole("button", { name: "Filter", exact: true }).click()
    const sheet = page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: "Filters", exact: true }),
    })
    await expect(sheet).toBeVisible()
    for (const filter of filters) {
        const label = sheet.getByText(filter.label, { exact: true })
        await expect(label, `${collection.labels.collection} should show ${filter.label}`).toBeVisible()
        await label.scrollIntoViewIfNeeded()
        await expectFilterOptions(page, label, filter, collection.labels.collection)
    }
    await sheet.getByRole("button", { name: "Close", exact: true }).click()
    await expect(sheet).toBeHidden()
}

const expectExport = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    schema: CollectionsSchema,
    collection: CollectionSchema,
    role: string,
) => {
    const customization = await customizationFile(project, schema, collection.labels.collection)
    const restrictExport = (await tryPromise(customization.admin?.restrictExport)) as string[] | undefined
    const titles = (await tryPromise(customization.admin?.titles)) as { collection?: string } | undefined
    const allowed = !restrictExport || restrictExport.includes(role)
    const filename = `${titles?.collection || collection.labels.collection}.csv`

    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible()
    await openList(ui)

    const actions = page.getByRole("button", { name: "Actions", exact: true })
    const inMenu = await actions.isVisible()
    if (inMenu) {
        await actions.click()
        await expect(page.getByRole("menu")).toBeVisible()
    }
    const control = inMenu
        ? page.getByRole("menuitem", { name: "Export", exact: true })
        : page.getByRole("button", { name: "Export", exact: true })

    if (!allowed) {
        await expect(control, `${collection.labels.collection} should hide Export from ${role}`).toHaveCount(0)
        return
    }

    await expect(control, `${collection.labels.collection} should show Export`).toBeVisible()
    if (await control.isDisabled()) {
        await expect(
            control,
            `${collection.labels.collection} export should be disabled when there is nothing to export`,
        ).toBeDisabled()
        return
    }

    const download = page.waitForEvent("download", { timeout: 30000 })
    await control.click()
    const file = await download
    expect(file.suggestedFilename(), `${collection.labels.collection} should download a CSV`).toBe(filename)
    const stream = await file.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) chunks.push(chunk)
    expect(Buffer.concat(chunks).toString("utf8").trim().length).toBeGreaterThan(0)
}

const elementId = (page: Page, id: string) => page.locator(`[id="${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`)

const canDragStatus = (field: CollectionField, role: string): boolean => {
    if (field.restrictUpdate === true) return false
    if (Array.isArray(field.restrictUpdate) && !field.restrictUpdate.includes(role)) return false
    if (Array.isArray(field.access) && !field.access.includes(role)) return false
    return true
}

const boardFieldName = (cards: CardsConfig, statusField: { field?: string } | undefined, preloaded: boolean) => {
    if ((!preloaded && !statusField && cards.statusField) || (preloaded && cards.statusField)) return cards.statusField
    return statusField?.field
}

const boardColumns = (field: CollectionField, cards: CardsConfig, customization: CollectionCustomization): string[] => {
    if ("values" in field && field.values) {
        const hidden = new Set((cards.excludeValues ?? []).map((value) => String(value)))
        return field.values.filter((value) => !hidden.has(String(value))).map((value) => String(value))
    }
    if (field.type === "Boolean") {
        const label =
            tryFunction(customization.fields.find((item) => item.name === field.name)?.admin?.label) || field.name
        return [String(label), `Not ${label}`]
    }
    return []
}

const boardCollections = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
): Promise<CollectionSchema[]> => {
    const collections = included(listableCollections(schema, role), options)
        .filter((collection) => {
            return (
                roleCanAccess(collection, role, "create") &&
                roleCanAccess(collection, role, "update") &&
                // eslint-disable-next-line security/detect-object-injection
                project.records[collection.labels.collection]
            )
        })
        .sort((a, b) => (a.seedOrder ?? Number.POSITIVE_INFINITY) - (b.seedOrder ?? Number.POSITIVE_INFINITY))
    const boards: CollectionSchema[] = []
    for (const collection of collections) {
        const customization = await customizationFile(project, schema, collection.labels.collection)
        const cards = (await tryPromise(customization.admin?.cards)) as CardsConfig | undefined
        if (!cards || (cards.roles && !cards.roles.includes(role))) continue
        const statusField = (await tryPromise(customization.admin?.statusField)) as { field?: string } | undefined
        const preloaded = !!collection.preloadCache?.roles?.includes(role)
        const fieldName = boardFieldName(cards, statusField, preloaded)
        const field = collection.fields.find((item) => item.name === fieldName)
        if (!field || boardColumns(field, cards, customization).length < 2 || !canDragStatus(field, role)) continue
        boards.push(collection)
    }
    return boards
}

const firstColumnValue = (field: CollectionField, cards: CardsConfig): string | number | boolean | undefined => {
    if ("values" in field && field.values) {
        const hidden = new Set((cards.excludeValues ?? []).map((value) => String(value)))
        return field.values.find((value) => !hidden.has(String(value)))
    }
    if (field.type === "Boolean") return true
    return
}

const dragCard = async (page: Page, sourceId: string, targetId: string) => {
    await page.evaluate(
        async ({ sourceId, targetId }) => {
            const source = document.getElementById(sourceId)
            const target = document.getElementById(targetId)
            if (!source || !target) throw new Error("The board card or column is not on the page.")
            const dataTransfer = new DataTransfer()
            const fire = (element: HTMLElement, type: string) => {
                element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }))
            }
            fire(source, "dragstart")
            await new Promise((resolve) => setTimeout(resolve, 50))
            fire(target, "dragenter")
            fire(target, "dragover")
            fire(target, "drop")
            fire(source, "dragend")
        },
        { sourceId, targetId },
    )
}

const expectBoardMove = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    schema: CollectionsSchema,
    collection: CollectionSchema,
    role: string,
) => {
    const customization = await customizationFile(project, schema, collection.labels.collection)
    const cards = (await tryPromise(customization.admin?.cards)) as CardsConfig
    const statusField = (await tryPromise(customization.admin?.statusField)) as { field?: string } | undefined
    const preloaded = !!collection.preloadCache?.roles?.includes(role)
    const field = collection.fields.find((item) => item.name === boardFieldName(cards, statusField, preloaded))
    if (!field) return
    const columns = boardColumns(field, cards, customization)
    const current = columns[0]
    const target = columns[1]
    const value = firstColumnValue(field, cards)
    const record = await createdRecord(project, collection)
    const title = record?.get(collection.recordTitleField) as string | undefined
    if (!record || !title || !current || !target || value === undefined) {
        throw new Error(`${collection.labels.collection} has no created record on the board.`)
    }
    await updateRecord([collection.labels.collection], record.id, { [field.name]: value })
    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible()
    await page.getByRole("tab", { name: cards.title || "Board", exact: true }).click()
    await expect(elementId(page, columns[0])).toBeVisible()
    if (await ui.collection.showAll.isVisible()) await ui.collection.showAll.check()
    await setFiltersToAll(page)
    const month = await createdRecordMonth(project, collection)
    if (month && (await ui.collection.range.label.isVisible())) {
        if (!(await ui.collection.range.previous.isVisible())) await selectMonthRange(page, ui)
        if (await ui.collection.range.previous.isVisible()) await showMonth(ui, month)
    }

    const card = elementId(page, `${current}-${record.id}`)
    await expect(card, `${collection.labels.record} "${title}" should be in ${current}`).toBeVisible({
        timeout: 30000,
    })
    await card.scrollIntoViewIfNeeded()
    await dragCard(page, `${current}-${record.id}`, target)
    await expect(ui.record.updated).toBeVisible({ timeout: 30000 })
    await expect(
        elementId(page, `${target}-${record.id}`),
        `${collection.labels.record} "${title}" should move to ${target}`,
    ).toBeVisible()
}

const expectChatReply = async (page: Page, ui: StokerLocators, collection: CollectionSchema) => {
    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible()
    const chat = page.getByRole("button").filter({ has: page.locator(".lucide-bot") })
    await expect(chat, `${collection.labels.collection} should show AI chat`).toBeVisible()
    await chat.click()
    const sheet = page.getByRole("dialog")
    await sheet.getByPlaceholder("Write a message...").fill("Say the word hello")
    await sheet.getByRole("button", { name: "Send", exact: true }).click()
    await expect(
        sheet.locator(".aui-md").getByText(/hello/i).first(),
        `${collection.labels.collection} chat should say hello`,
    ).toBeVisible({ timeout: 60000 })
}

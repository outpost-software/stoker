import type {
    CardsConfig,
    CollectionCustomization,
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    Filter,
    ImagesConfig,
    StokerPermissions,
} from "@stoker-platform/types"
import type { Locator, Page } from "@playwright/test"
import {
    canUpdateField,
    collectionAccess,
    hasDependencyAccess,
    isRelationField,
    isSortingEnabled,
    roleHasOperationAccess,
    tryFunction,
    tryPromise,
} from "@stoker-platform/utils"
import { fixtureRecord } from "../config/records.js"
import { expect, test } from "../config/fixtures.js"
import type { StokerLocators } from "../config/locators.js"
import type { StokerProject } from "../config/project.js"
import { detectControl, openedRecord, setField } from "./utils/form.js"
import {
    openCollection,
    openCollectionList,
    openRecordRow,
    showAllRecords,
    showListMonth,
    waitForRecord,
} from "./utils/list.js"
import { fixtureCollections, includedCollections, skipCollection, type ConformanceOptions } from "../config/options.js"
import { getCurrentUser, getCurrentUserPermissions } from "../initializeStoker.js"
import { getCustomizationFile } from "@stoker-platform/node-client"

export const collectionConformance = (options: ConformanceOptions) => {
    test.describe("collection pages", () => {
        test("search all opens a record", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = searchableCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no searchable record from editing`)

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    const title = await fixtureRecordTitle(project, collection, role)
                    await openFromSearch(page, ui, project, collection, role, title)
                })
            }
        })

        test("search opens a record", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = searchableCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no searchable record from editing`)

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    const title = await fixtureRecordTitle(project, collection, role)
                    const month = await fixtureRecordMonth(project, collection, role)
                    await expectInListSearch(page, ui, project, collection, role, title, month)
                })
            }
        })

        test("AI chat responds", async ({ page, schema, role, ui }) => {
            const collections = chatCollections(schema, role, options)
            test.skip(collections.length === 0, `${role} has no AI chat`)
            test.setTimeout(collections.length * 90000)

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await expectChatReply(page, ui, collection)
                })
            }
        })

        test("all filters are present", async ({ page, schema, role, ui }) => {
            const collections = await collectionsWithFilters(schema, role, options)
            test.skip(collections.length === 0, `${role} has no filters`)

            for (const { collection, filters, status } of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await expectFilters(page, ui, collection, filters, status)
                })
            }
        })

        test("export button works or is disabled", async ({ page, schema, role, ui }) => {
            const collections = includedCollections(schema, role, options)
            test.skip(collections.length === 0, `${role} cannot read any collection`)
            test.setTimeout(Math.max(120000, collections.length * 30000))

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await expectExport(page, ui, schema, collection, role)
                })
            }
        })

        test("sort fields match on board and images", async ({ page, schema, role, ui }) => {
            const collections = await sortViews(schema, role, options)
            test.skip(collections.length === 0, `${role} has no board or images view`)
            test.setTimeout(Math.max(120000, collections.length * 30000))

            for (const { collection, views, labels } of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await expectSortFields(page, ui, collection, views, labels)
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
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await expectBoardMove(page, ui, schema, collection, project, role)
                })
            }
        })
    })
}

const searchableCollections = (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
): CollectionSchema[] =>
    fixtureCollections(schema, role, project, options).filter(
        (collection) => !!collection.fullTextSearch?.length && roleHasOperationAccess(collection, role, "create"),
    )

const fixtureRecordTitle = async (
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
): Promise<string> => {
    const record = await fixtureRecord(project, collection, role)
    return record.get(collection.recordTitleField)
}

const fixtureRecordMonth = async (
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
): Promise<string | undefined> => {
    const rangeField = collection.preloadCache?.range?.fields[0]
    if (!rangeField) return
    const record = await fixtureRecord(project, collection, role)
    const value = record?.get(rangeField) as { toDate?: () => Date } | undefined
    const date = value?.toDate?.()
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${month}-${day}`
}

const waitForViewTransition = (page: Page) =>
    page.waitForFunction(() =>
        document.getAnimations().every((animation) => {
            const effect = animation.effect as { pseudoElement?: string | null } | null
            return !effect?.pseudoElement?.includes("view-transition")
        }),
    )

const openFromSearch = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
    title: string,
) => {
    await page.goto("/")
    await expect(ui.app.search).toBeVisible({ timeout: 30000 })
    const query = await searchableValue(project, collection, role, title)
    await ui.app.search.fill(query)
    const result = page.getByRole("dialog").getByRole("cell", { name: title, exact: true }).first()
    await expect(result, `${collection.labels.record} for "${title}" should appear in Search all`).toBeVisible({
        timeout: 30000,
    })
    await result.click()
    const segment = `/${collection.labels.record.toLowerCase()}/`
    await page.waitForURL((url) => url.pathname.toLowerCase().includes(segment))
    await waitForViewTransition(page)
    if (!page.url().includes("/edit")) {
        const details = page.getByRole("button", { name: "Details", exact: true }).filter({ visible: true })
        await expect(details.first()).toBeVisible({ timeout: 30000 })
        await details.first().click()
        await page.waitForURL((url) => url.pathname.includes("/edit"))
        await waitForViewTransition(page)
    }
    await waitForRecord(page, ui, collection)
    await expect(ui.app.errorPage).toBeHidden()
}

const searchableValue = async (project: StokerProject, collection: CollectionSchema, role: string, title: string) => {
    const record = await fixtureRecord(project, collection, role)
    const field = collection.fullTextSearch?.find(
        (name) => typeof record.get(name) === "string" && record.get(name) !== "",
    )
    // eslint-disable-next-line security/detect-object-injection
    return field ? (record.get(field) as string) : title
}

const expectInListSearch = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
    title: string,
    month?: string,
) => {
    await openCollectionList(page, ui, collection)
    await showAllRecords(page, ui)
    await showListMonth(page, ui, month)
    const query = await searchableValue(project, collection, role, title)
    await ui.collection.search.fill(query)
    const row = ui.collection.rows.first()
    await expect(row, `${collection.labels.record} for query "${query}" should appear in the list`).toBeVisible({
        timeout: 30000,
    })
}

const chatCollections = (schema: CollectionsSchema, role: string, options: ConformanceOptions): CollectionSchema[] =>
    includedCollections(schema, role, options).filter(
        (collection) => !!collection.ai?.chat && collection.ai.chat.roles.includes(role),
    )

const expectChatReply = async (page: Page, ui: StokerLocators, collection: CollectionSchema) => {
    await openCollection(page, ui, collection)
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
    permissions: StokerPermissions,
    claims: Record<string, unknown>,
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
        if (Array.isArray(field.access) && !field.access.includes(role)) continue
        if (filter.type === "select" && field.type !== "Boolean" && !("values" in field && field.values)) continue
        if (filter.type === "relation") {
            if (!isRelationField(field)) continue
            // eslint-disable-next-line security/detect-object-injection
            const target = schema.collections[field.collection]
            if (!target?.fullTextSearch) continue
            // eslint-disable-next-line security/detect-object-injection
            const collectionPermissions = permissions.collections?.[target.labels.collection]
            const fullAccess = !!collectionPermissions && !!collectionAccess("Read", collectionPermissions)
            const dependencyAccess = hasDependencyAccess(target, schema, permissions, claims)
            if (!fullAccess && dependencyAccess.length === 0) continue
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

const statusOptions = (statusField: StatusField | undefined, collection: CollectionSchema): string[] => {
    if (!statusField && !collection.softDelete) return []
    const options: string[] = []
    if (statusField?.active) options.push("Active")
    if (statusField?.archived) options.push("Archived")
    options.push("All")
    if (collection.softDelete) options.push("Trash")
    return options
}

const collectionsWithFilters = async (
    schema: CollectionsSchema,
    role: string,
    options: ConformanceOptions,
): Promise<{ collection: CollectionSchema; filters: VisibleFilter[]; status: string[] }[]> => {
    const collections = includedCollections(schema, role, options)
    const permissions = await getCurrentUserPermissions(role)
    const claims = ((await getCurrentUser(role)).customClaims ?? {}) as Record<string, unknown>
    const visible: { collection: CollectionSchema; filters: VisibleFilter[]; status: string[] }[] = []
    for (const collection of collections) {
        const customization = await getCustomizationFile(collection.labels.collection, schema)
        const statusField = (await tryPromise(customization.admin?.statusField)) as StatusField | undefined
        const filters = await visibleFilters(
            customization,
            collection,
            schema,
            role,
            permissions,
            claims,
            statusField?.field,
        )
        const status = statusOptions(statusField, collection)
        if (filters.length > 0 || status.length > 0) visible.push({ collection, filters, status })
    }
    return visible
}

const statusRadioName = (option: string): string => {
    if (option === "Active") return "Toggle active"
    if (option === "Archived") return "Toggle archived"
    if (option === "Trash") return "Toggle trash"
    return "Toggle all"
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
    await openCollectionList(page, ui, collection)
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
    schema: CollectionsSchema,
    collection: CollectionSchema,
    role: string,
) => {
    const customization = await getCustomizationFile(collection.labels.collection, schema)
    const restrictExport = (await tryPromise(customization.admin?.restrictExport)) as string[] | undefined
    const titles = (await tryPromise(customization.admin?.titles)) as { collection?: string } | undefined
    const allowed = !restrictExport || restrictExport.includes(role)
    const filename = `${titles?.collection || collection.labels.collection}.csv`

    await openCollectionList(page, ui, collection)

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

const sortLabels = (collection: CollectionSchema, customization: CollectionCustomization, role: string): string[] => {
    const preloaded = !!collection.preloadCache?.roles?.includes(role)
    const readOnly = !!collection.access.serverReadOnly?.includes(role)
    const labels: string[] = []
    for (const field of collection.fields) {
        if (field.type === "ManyToOne" || field.type === "ManyToMany") continue
        const sorting = isSortingEnabled(field, { Role: role } as StokerPermissions)
        if (!(
            preloaded ||
            readOnly ||
            (sorting && field.type !== "Computed") ||
            field.name === collection.recordTitleField
        )) {
            continue
        }
        const custom = customization.fields.find((item) => item.name === field.name)
        const list = custom?.admin?.condition?.list
        if (list !== undefined && !tryFunction(list)) continue
        labels.push(String(tryFunction(custom?.admin?.label) || field.name))
    }
    return labels
}

const sortViews = async (
    schema: CollectionsSchema,
    role: string,
    options: ConformanceOptions,
): Promise<{ collection: CollectionSchema; views: string[]; labels: string[] }[]> => {
    const collections = includedCollections(schema, role, options)
    const visible: { collection: CollectionSchema; views: string[]; labels: string[] }[] = []
    for (const collection of collections) {
        const customization = await getCustomizationFile(collection.labels.collection, schema)
        const cards = (await tryPromise(customization.admin?.cards)) as CardsConfig | undefined
        const images = (await tryPromise(customization.admin?.images)) as ImagesConfig | undefined
        const status = (await tryPromise(customization.admin?.statusField)) as { field?: string } | undefined
        const preloaded = !!collection.preloadCache?.roles?.includes(role)
        const views: string[] = []
        if (cards && (!cards.roles || cards.roles.includes(role))) {
            const useCardsField = (!preloaded && !status && cards.statusField) || (preloaded && cards.statusField)
            const statusName = useCardsField ? cards.statusField : status?.field
            if (statusName && collection.fields.some((field) => field.name === statusName)) {
                views.push(cards.title || "Board")
            }
        }
        if (
            images &&
            (!images.roles || images.roles.includes(role)) &&
            images.imageField &&
            collection.fields.some((field) => field.name === images.imageField)
        ) {
            views.push(images.title || "Pics")
        }
        if (views.length === 0) continue
        visible.push({ collection, views, labels: sortLabels(collection, customization, role) })
    }
    return visible
}

const expectSortFields = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    views: string[],
    labels: string[],
) => {
    await openCollection(page, ui, collection)
    const expected = [...labels].sort()
    for (const view of views) {
        await page.getByRole("tab", { name: view, exact: true }).click()
        await page.getByRole("button", { name: "Sort", exact: true }).click()
        const items = page.getByRole("menuitem")
        const actual = (await items.allTextContents()).map((text) => text.replace(/\s+/g, " ").trim()).sort()
        expect(actual, `${collection.labels.collection} ${view} sort menu`).toEqual(expected)
        await page.keyboard.press("Escape")
    }
}

const elementId = (page: Page, id: string) => page.locator(`[id="${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`)

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
    const collections = fixtureCollections(schema, role, project, options).filter(
        (collection) =>
            roleHasOperationAccess(collection, role, "create") && roleHasOperationAccess(collection, role, "update"),
    )
    const boards: CollectionSchema[] = []
    for (const collection of collections) {
        const customization = await getCustomizationFile(collection.labels.collection, schema)
        const cards = (await tryPromise(customization.admin?.cards)) as CardsConfig | undefined
        if (!cards || (cards.roles && !cards.roles.includes(role))) continue
        const statusField = (await tryPromise(customization.admin?.statusField)) as { field?: string } | undefined
        const preloaded = !!collection.preloadCache?.roles?.includes(role)
        const fieldName = boardFieldName(cards, statusField, preloaded)
        const field = collection.fields.find((item) => item.name === fieldName)
        const user = await getCurrentUser(role)
        const permissions = await getCurrentUserPermissions(role)
        if (
            !field ||
            boardColumns(field, cards, customization).length < 2 ||
            !(await canUpdateField(collection, field, permissions, user.customClaims ?? {}))
        ) {
            continue
        }
        boards.push(collection)
    }
    return boards
}

const columnValues = (field: CollectionField, cards: CardsConfig): string[] => {
    if ("values" in field && field.values) {
        const hidden = new Set((cards.excludeValues ?? []).map((value) => String(value)))
        return field.values.filter((value) => !hidden.has(String(value))).map((value) => String(value))
    }
    if (field.type === "Boolean") return ["true", "false"]
    return []
}

const updateMany = async (page: Page, ui: StokerLocators, fieldName: string, values: string[]): Promise<number> => {
    const row = ui.collection.rows.first()
    await row.getByRole("checkbox", { name: "Select row" }).check()
    await page.getByRole("button", { name: "Update Selected", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    const field = dialog.getByTestId(`field-${fieldName}`)
    const control = await detectControl(field)
    const error = dialog.locator(".bg-destructive")

    for (const [index, value] of values.entries()) {
        await setField(page, field, control, value, { rootDir: "", assignsFilePermissions: false })
        await dialog.getByRole("button", { name: "Save", exact: true }).click()
        let outcome = "pending"
        await expect
            .poll(
                async () => {
                    if (!(await dialog.isVisible())) outcome = "saved"
                    else if (index < values.length - 1 && (await error.isVisible())) outcome = "invalid"
                    return outcome
                },
                { timeout: 120000 },
            )
            .not.toBe("pending")
        if (outcome === "saved") {
            await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
            return index
        }
    }

    await expect(dialog).toBeHidden({ timeout: 120000 })
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    return values.length - 1
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
    schema: CollectionsSchema,
    collection: CollectionSchema,
    project: StokerProject,
    role: string,
) => {
    const customization = await getCustomizationFile(collection.labels.collection, schema)
    const cards = (await tryPromise(customization.admin?.cards)) as CardsConfig
    const statusField = (await tryPromise(customization.admin?.statusField)) as { field?: string } | undefined
    const preloaded = !!collection.preloadCache?.roles?.includes(role)
    const field = collection.fields.find((item) => item.name === boardFieldName(cards, statusField, preloaded))
    if (!field) return
    const columns = boardColumns(field, cards, customization)
    const values = columnValues(field, cards)
    if (values.length === 0 || columns.length < 2) {
        throw new Error(`${collection.labels.collection} has no board to move a record on.`)
    }
    const month = await fixtureRecordMonth(project, collection, role)
    await openCollectionList(page, ui, collection)
    await showAllRecords(page, ui)
    await showListMonth(page, ui, month)
    const saved = await updateMany(page, ui, field.name, values)
    // eslint-disable-next-line security/detect-object-injection
    const current = columns[saved]
    // eslint-disable-next-line security/detect-object-injection
    const target = columns[saved + 1] ?? columns[saved - 1]
    await openRecordRow(page, ui, collection, ui.collection.rows.first())
    const record = await openedRecord(page, collection)
    const title = String(record[collection.recordTitleField] ?? record.id)
    // eslint-disable-next-line security/detect-object-injection
    expect(String(record[field.name]), `${collection.labels.record} "${title}" should be updated`).toBe(values[saved])
    await openCollection(page, ui, collection)
    await showAllRecords(page, ui)
    await showListMonth(page, ui, month)
    await page.getByRole("tab", { name: cards.title || "Board", exact: true }).click()
    await expect(elementId(page, current)).toBeVisible()

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

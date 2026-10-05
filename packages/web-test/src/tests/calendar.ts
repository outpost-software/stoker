import type { CalendarConfig, CollectionSchema, CollectionsSchema, StokerRecord } from "@stoker-platform/types"
import type { Locator, Page } from "@playwright/test"
import { canUpdateField, roleHasOperationAccess, tryPromise } from "@stoker-platform/utils"
import { expect, test } from "../config/fixtures.js"
import type { StokerLocators } from "../config/locators.js"
import type { StokerProject } from "../config/project.js"
import { assignsFilePermissions, distinctValue, isUnique } from "../config/schema.js"
import { DATE, detectControl, expectField, setField, type FormContext } from "./utils/form.js"
import { openCollection, showAllRecords } from "./utils/list.js"
import { includedCollections, type ConformanceOptions } from "../config/options.js"
import { getCurrentUser, getCurrentUserPermissions, getTenant } from "../initializeStoker.js"
import { getCustomizationFile, getStokerFirestore } from "@stoker-platform/node-client"

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

interface CalendarCollection {
    collection: CollectionSchema
    calendar: CalendarConfig
}

export const calendarConformance = (options: ConformanceOptions) => {
    test.describe("calendar", () => {
        test("drag grid to add a record", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so related records were not created")
            const collections = (await calendars(schema, role, options)).filter(({ collection }) =>
                canCreate(collection, role, project),
            )
            test.skip(collections.length === 0, `${role} has no calendar that can add a record`)
            test.setTimeout(Math.max(180000, collections.length * 180000))

            for (const { collection, calendar } of collections) {
                await test.step(collection.labels.collection, async () => {
                    await addFromCalendar(page, ui, project, collection, calendar, role)
                })
            }
        })

        test("drag event to update record dates", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = await updatableCalendars(schema, role, project, options, "startField")
            test.skip(collections.length === 0, `${role} has no calendar event to drag`)
            test.setTimeout(Math.max(120000, collections.length * 120000))

            for (const { collection, calendar } of collections) {
                await test.step(collection.labels.collection, async () => {
                    await dragEvent(page, ui, project, collection, calendar, role)
                })
            }
        })

        test("resize event to update record end date", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = await updatableCalendars(schema, role, project, options, "endField")
            test.skip(collections.length === 0, `${role} has no calendar event to resize`)
            test.setTimeout(Math.max(120000, collections.length * 120000))

            for (const { collection, calendar } of collections) {
                await test.step(collection.labels.collection, async () => {
                    await resizeEvent(page, ui, project, collection, calendar, role)
                })
            }
        })
    })
}

const calendars = async (
    schema: CollectionsSchema,
    role: string,
    options: ConformanceOptions,
): Promise<CalendarCollection[]> => {
    const collections = includedCollections(schema, role, options)
    const visible: CalendarCollection[] = []
    for (const collection of collections) {
        const customization = await getCustomizationFile(collection.labels.collection, schema)
        const calendar = (await tryPromise(customization.admin?.calendar)) as CalendarConfig | undefined
        if (!calendar?.startField || (calendar.roles && !calendar.roles.includes(role))) continue
        visible.push({ collection, calendar })
    }
    return visible
}

const canCreate = (collection: CollectionSchema, role: string, project: StokerProject) =>
    roleHasOperationAccess(collection, role, "create") && !!project.records[collection.labels.collection]

const canUpdate = async (collection: CollectionSchema, role: string, project: StokerProject, fieldName: string) => {
    const field = collection.fields.find((item) => item.name === fieldName)
    const user = await getCurrentUser(role)
    const permissions = await getCurrentUserPermissions(role)
    if (!field || !(await canUpdateField(collection, field, permissions, user.customClaims ?? {}))) return false
    return roleHasOperationAccess(collection, role, "update") && !!project.records[collection.labels.collection]
}

const updatableCalendars = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
    field: "startField" | "endField",
) => {
    const visible = await calendars(schema, role, options)
    const updatable: CalendarCollection[] = []
    for (const entry of visible) {
        const fieldName = field === "startField" ? entry.calendar.startField : entry.calendar.endField
        if (fieldName && (await canUpdate(entry.collection, role, project, fieldName))) updatable.push(entry)
    }
    return updatable
}

const calendarRoot = (page: Page) => page.locator(".fc").filter({ visible: true }).first()

const showCalendar = async (page: Page, ui: StokerLocators, collection: CollectionSchema, calendar: CalendarConfig) => {
    await openCollection(page, ui, collection)
    await page.getByRole("tab", { name: calendar.title || "Calendar", exact: true }).click()
    await expect(calendarRoot(page)).toBeVisible()
    await showAllRecords(page, ui)
    const month = calendarRoot(page).getByRole("button", { name: "Month", exact: true })
    if (await month.isVisible()) await month.click()
}

const showCalendarMonth = async (page: Page, date: string) => {
    const title = calendarRoot(page).locator(".fc-toolbar-title")
    const target = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
    const shown = async () => {
        const text = (await title.innerText()).trim()
        const year = Number(text.slice(-4))
        const month = MONTHS.indexOf(text.slice(0, -5))
        if (month < 0 || !Number.isFinite(year)) throw new Error(`Unexpected calendar title "${text}"`)
        return year * 12 + month
    }
    const steps = target - (await shown())
    const control =
        steps > 0 ? calendarRoot(page).locator(".fc-next-button") : calendarRoot(page).locator(".fc-prev-button")
    for (let step = 0; step < Math.abs(steps); step++) {
        const before = await shown()
        await control.click()
        await expect.poll(shown).not.toBe(before)
    }
}

const dayCell = (page: Page, date: string) => calendarRoot(page).locator(`.fc-daygrid-day[data-date="${date}"]`)

type DragOrigin = "center" | "start" | "end" | "corner"

const CORNER = { x: 8, y: 8 }

const drag = async (page: Page, from: Locator, to: Locator, origin: DragOrigin = "center") => {
    await from.scrollIntoViewIfNeeded()
    await to.scrollIntoViewIfNeeded()
    const source = await from.boundingBox()
    const target = await to.boundingBox()
    if (!source || !target) throw new Error("Calendar drag target is not visible")
    const startX =
        origin === "start" || origin === "corner"
            ? source.x + (origin === "corner" ? CORNER.x : 12)
            : origin === "end"
              ? source.x + source.width - 4
              : source.x + source.width / 2
    const startY = origin === "corner" ? source.y + CORNER.y : source.y + source.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 })
    await page.mouse.up()
}

const fixtureTitle = (project: StokerProject, collection: CollectionSchema) => {
    // eslint-disable-next-line security/detect-object-injection
    const field = project.records[collection.labels.collection]?.[collection.recordTitleField]
    return field?.update || field?.create
}

const calendarTitle = (project: StokerProject, collection: CollectionSchema, role: string) => {
    const base = fixtureTitle(project, collection)
    if (!base) return undefined
    const titleField = collection.fields.find((item) => item.name === collection.recordTitleField)
    return titleField && isUnique(titleField) ? `${base} Calendar` : `${base} ${role} Calendar`
}

const addDays = (date: string, days: number) => {
    const [year, month, day] = date.split("-").map(Number)
    const next = new Date(Date.UTC(year, month - 1, day + days))
    return next.toISOString().slice(0, 10)
}

const dateStamp = (value: unknown): string | undefined => {
    if (!value || typeof value !== "object" || !("toDate" in value) || typeof value.toDate !== "function") return
    const date = value.toDate() as Date
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Melbourne",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date)
}

const collectionDocs = async (collection: CollectionSchema) => {
    const db = getStokerFirestore()
    const tenantId = getTenant()
    const snapshot = await db.collection("tenants").doc(tenantId).collection(collection.labels.collection).get()
    return snapshot.docs
}

const findRecord = async (collection: CollectionSchema, title: string) =>
    (await collectionDocs(collection)).find((doc) => doc.get(collection.recordTitleField) === title)

const findTitleByDate = async (collection: CollectionSchema, field: string, date: string) => {
    const doc = (await collectionDocs(collection)).find((doc) => dateStamp(doc.get(field)) === date)
    const value = doc?.get(collection.recordTitleField)
    return typeof value === "string" ? value : undefined
}

const eventWithTitle = (page: Page, title: string) =>
    calendarRoot(page)
        .locator(".fc-event")
        .filter({ has: page.getByText(title, { exact: true }) })

const expectRecordDate = async (collection: CollectionSchema, title: string, field: string, date: string) => {
    await expect
        .poll(
            async () => {
                const db = getStokerFirestore()
                const tenantId = getTenant()
                const snapshot = await db
                    .collection("tenants")
                    .doc(tenantId)
                    .collection(collection.labels.collection)
                    .get()
                return snapshot.docs.some(
                    (doc) => doc.get(collection.recordTitleField) === title && dateStamp(doc.get(field)) === date,
                )
            },
            { timeout: 30000 },
        )
        .toBe(true)
}

const overlapsDay = (
    eventBox: { x: number; y: number; width: number; height: number },
    dayBox: { x: number; y: number; width: number; height: number },
) => {
    const x = dayBox.x + dayBox.width / 2
    const vertical = eventBox.y < dayBox.y + dayBox.height && eventBox.y + eventBox.height > dayBox.y
    return vertical && x >= eventBox.x - 1 && x <= eventBox.x + eventBox.width + 1
}

const eventCovers = async (page: Page, title: string, date: string) => {
    const dayBox = await dayCell(page, date).boundingBox()
    if (!dayBox) return false
    const events = eventWithTitle(page, title)
    const count = await events.count()
    for (let index = 0; index < count; index++) {
        const eventBox = await events.nth(index).boundingBox()
        if (eventBox && overlapsDay(eventBox, dayBox)) return true
    }
    return false
}

const addFromCalendar = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    collection: CollectionSchema,
    calendar: CalendarConfig,
    role: string,
) => {
    const start = "2026-06-08"
    await showCalendar(page, ui, collection, calendar)
    await showCalendarMonth(page, start)
    if (calendar.endField) await drag(page, dayCell(page, start), dayCell(page, "2026-06-11"), "corner")
    else await dayCell(page, start).click({ position: CORNER })

    const picker = page.locator("#collection-picker-modal")
    const startField = page.getByTestId(`field-${calendar.startField}`)
    await expect(picker.or(startField).first()).toBeVisible()
    if (await picker.isVisible()) {
        const titles = await tryPromise(collection.admin?.titles)
        const recordTitle = titles?.record || collection.labels.record
        await picker.getByRole("button", { name: `Add ${recordTitle}`, exact: true }).click()
    }
    const dialog = page.getByRole("dialog").filter({ has: page.getByTestId(`field-${calendar.startField}`) })
    await expect(dialog, `${collection.labels.collection} create dialog should open from the calendar`).toBeVisible()
    await expectField(dialog.getByTestId(`field-${calendar.startField}`), "calendar", start)
    let end: string | undefined
    if (calendar.endField) {
        const endSelected = dialog.getByTestId(`field-${calendar.endField}`).locator("[aria-selected='true']")
        await expect(endSelected).toHaveCount(1)
        const endDay = (await endSelected.innerText()).trim()
        expect(["10", "11"]).toContain(endDay)
        end = `2026-06-${endDay.padStart(2, "0")}`
    }

    const context: FormContext = {
        rootDir: project.rootDir,
        assignsFilePermissions: assignsFilePermissions(collection, role),
    }
    // eslint-disable-next-line security/detect-object-injection
    const fixture = project.records[collection.labels.collection]
    const fixtureTitled = calendarTitle(project, collection, role)
    let title = fixtureTitled ?? ""
    const rangeField = collection.preloadCache?.range?.fields?.[0]
    const pairedEnd = collection.preloadCache?.range?.ranges?.find((range) => range[0] === calendar.startField)?.[1]
    for (const [name, field] of Object.entries(fixture)) {
        if (name === calendar.startField || name === calendar.endField) continue
        if (name === collection.recordTitleField ? !fixtureTitled : !field.create) continue
        const schemaField = collection.fields.find((item) => item.name === name)
        const value =
            name === collection.recordTitleField
                ? title
                : schemaField && isUnique(schemaField)
                  ? distinctValue(schemaField, field.create ?? "", "Calendar", 3)
                  : name === pairedEnd && field.create && DATE.test(field.create) && field.create <= addDays(start, 7)
                    ? addDays(start, 21)
                    : rangeField && name === rangeField && field.create && DATE.test(field.create)
                      ? start
                      : (field.create ?? "")
        const control = dialog.getByTestId(`field-${name}`)
        if ((await control.count()) === 0) continue
        const kind = await detectControl(control)
        if (kind === "readOnly") continue
        await setField(page, control, kind, value, context)
    }
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 120000 })
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    if (!fixtureTitled) {
        await expect
            .poll(
                async () => {
                    title = (await findTitleByDate(collection, calendar.startField, start)) ?? ""
                    return title
                },
                { timeout: 30000 },
            )
            .not.toBe("")
    }
    await expect(eventWithTitle(page, title).first()).toBeVisible({ timeout: 30000 })
    await expect.poll(() => eventCovers(page, title, start)).toBe(true)
    await expectRecordDate(collection, title, calendar.startField, start)
    if (end && calendar.endField) {
        await expect.poll(() => eventCovers(page, title, end)).toBe(true)
        await expectRecordDate(collection, title, calendar.endField, end)
    }
}

const shownOnCalendar = (calendar: CalendarConfig, data: Record<string, unknown>) => {
    // eslint-disable-next-line security/detect-object-injection
    if (!data[calendar.startField]) return false
    if (typeof calendar.filterRecords !== "function") return true
    try {
        return calendar.filterRecords(data as StokerRecord)
    } catch {
        return true
    }
}

const shiftWithinMonth = (date: string, days: number) => {
    const forward = addDays(date, days)
    if (forward.slice(0, 7) === date.slice(0, 7)) return forward
    return addDays(date, -days)
}

const daysBetween = (from: string, to: string) => {
    const [fromYear, fromMonth, fromDay] = from.split("-").map(Number)
    const [toYear, toMonth, toDay] = to.split("-").map(Number)
    return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86400000)
}

const locateEvent = async (
    project: StokerProject,
    collection: CollectionSchema,
    calendar: CalendarConfig,
    role: string,
) => {
    const db = getStokerFirestore()
    const tenantId = getTenant()
    const snapshot = await db.collection("tenants").doc(tenantId).collection(collection.labels.collection).get()
    const rangeField = collection.preloadCache?.range?.fields?.[0]
    const shown = snapshot.docs.filter((doc) => {
        if (!shownOnCalendar(calendar, doc.data())) return false
        if (!rangeField || rangeField === calendar.startField) return true
        const rangeDate = dateStamp(doc.get(rangeField))
        const startDate = dateStamp(doc.get(calendar.startField))
        return !!rangeDate && !!startDate && rangeDate.slice(0, 7) === startDate.slice(0, 7)
    })
    const titleOf = (doc: (typeof shown)[number]) => {
        const value = doc.get(collection.recordTitleField)
        return typeof value === "string" ? value : undefined
    }
    const names = [calendarTitle(project, collection, role), fixtureTitle(project, collection)].filter(
        (name) => name !== undefined,
    )
    for (const name of names) {
        const doc = shown.find((doc) => titleOf(doc) === name)
        if (doc) return { title: name, record: doc }
    }
    const doc = shown.find((doc) => titleOf(doc))
    if (!doc) throw new Error(`${collection.labels.collection} has no event to update`)
    const title = titleOf(doc)
    if (!title) throw new Error(`${collection.labels.collection} has no event to update`)
    return { title, record: doc }
}

const dragEvent = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    collection: CollectionSchema,
    calendar: CalendarConfig,
    role: string,
) => {
    const { title, record } = await locateEvent(project, collection, calendar, role)
    const start = dateStamp(record.get(calendar.startField))
    if (!start) throw new Error(`${collection.labels.collection} has no event to drag`)
    const end = calendar.endField ? dateStamp(record.get(calendar.endField)) : undefined
    const drop = shiftWithinMonth(start, 7)
    await showCalendar(page, ui, collection, calendar)
    await showCalendarMonth(page, start)
    const event = eventWithTitle(page, title).first()
    await expect(event).toBeVisible({ timeout: 30000 })
    const before = await ui.record.updated.count()
    await drag(page, event, dayCell(page, drop), calendar.endField ? "start" : "center")
    await expect.poll(() => ui.record.updated.count(), { timeout: 60000 }).toBeGreaterThan(before)
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    await expect.poll(() => eventCovers(page, title, drop)).toBe(true)
    await expectRecordDate(collection, title, calendar.startField, drop)
    if (calendar.endField && end) {
        await expectRecordDate(collection, title, calendar.endField, addDays(end, daysBetween(start, drop)))
    }
}

const resizeEvent = async (
    page: Page,
    ui: StokerLocators,
    project: StokerProject,
    collection: CollectionSchema,
    calendar: CalendarConfig,
    role: string,
) => {
    const endField = calendar.endField
    if (!endField) throw new Error(`${collection.labels.collection} has no event end to resize`)
    const { title, record } = await locateEvent(project, collection, calendar, role)
    const start = dateStamp(record.get(calendar.startField))
    const end = dateStamp(record.get(endField))
    if (!start || !end) throw new Error(`${collection.labels.collection} has no event to resize`)
    const resized = shiftWithinMonth(end, 3)
    if (resized < start) throw new Error(`${end} cannot be resized without moving before ${start}`)
    await showCalendar(page, ui, collection, calendar)
    await showCalendarMonth(page, end)
    const event = calendarRoot(page)
        .locator(".fc-event.fc-event-end")
        .filter({ has: page.getByText(title, { exact: true }) })
        .first()
    await expect(event).toBeVisible({ timeout: 30000 })
    await event.hover()
    const handle = event.locator(".fc-event-resizer-end")
    const before = await ui.record.updated.count()
    await drag(page, (await handle.count()) > 0 ? handle : event, dayCell(page, resized), "end")
    await expect.poll(() => ui.record.updated.count(), { timeout: 60000 }).toBeGreaterThan(before)
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    const accepted = new Set([resized, addDays(resized, -1)])
    let savedEnd = ""
    await expect
        .poll(
            async () => {
                savedEnd = dateStamp((await findRecord(collection, title))?.get(endField)) ?? ""
                return accepted.has(savedEnd)
            },
            { timeout: 30000 },
        )
        .toBe(true)
    await expect.poll(() => eventCovers(page, title, savedEnd)).toBe(true)
    await expectRecordDate(collection, title, calendar.startField, start)
}

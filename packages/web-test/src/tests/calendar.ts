import type { CalendarConfig, CollectionSchema, CollectionsSchema, StokerRecord } from "@stoker-platform/types"
import type { Locator, Page } from "@playwright/test"
import type { DocumentSnapshot } from "firebase-admin/firestore"
import { canUpdateField, roleHasOperationAccess, tryPromise } from "@stoker-platform/utils"
import { expect, test } from "../config/fixtures.js"
import type { StokerLocators } from "../config/locators.js"
import type { StokerProject } from "../config/project.js"
import { assignsFilePermissions, distinctValue, isUnique } from "../config/schema.js"
import { DATE, detectControl, expectField, setField, shownDay, type FormContext } from "./utils/form.js"
import { openCollection, showAllRecords } from "./utils/list.js"
import { includedCollections, skipCollection, type ConformanceOptions } from "../config/options.js"
import { getCurrentUser, getCurrentUserPermissions } from "../initializeStoker.js"
import { getCustomizationFile } from "@stoker-platform/node-client"
import { fixtureRecord, fixtureUpdatesDisabled, tenantCollection } from "../config/records.js"

interface CalendarCollection {
    collection: CollectionSchema
    calendar: CalendarConfig
}

interface CreatedCalendarRecord {
    collection: CollectionSchema
    calendar: CalendarConfig
    id: string
}

const createdFromCalendar: CreatedCalendarRecord[] = []

export const calendarConformance = (options: ConformanceOptions) => {
    test.describe("calendar", () => {
        test("drag grid to add a record", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so related records were not created")
            const collections = await createableCalendars(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no calendar that can add a record`)
            test.setTimeout(Math.max(180000, collections.length * 180000))

            for (const { collection, calendar } of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
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
                    if (skipCollection(options, role, collection.labels.collection)) return
                    if (await fixtureUpdatesDisabled(schema, project, collection, role)) {
                        test.info().annotations.push({
                            type: "skipped",
                            description: `${collection.labels.collection}: updates are disabled for this record`,
                        })
                        return
                    }
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
                    if (skipCollection(options, role, collection.labels.collection)) return
                    if (await fixtureUpdatesDisabled(schema, project, collection, role)) {
                        test.info().annotations.push({
                            type: "skipped",
                            description: `${collection.labels.collection}: updates are disabled for this record`,
                        })
                        return
                    }
                    await resizeEvent(page, ui, project, collection, calendar, role)
                })
            }
        })

        test("delete records added from the calendar", async ({ page, ui, role }) => {
            test.skip(createdFromCalendar.length === 0, "no record was added from the calendar")
            test.setTimeout(Math.max(120000, createdFromCalendar.length * 120000))

            while (createdFromCalendar.length > 0) {
                const { collection, calendar, id } = createdFromCalendar[0]
                if (!roleHasOperationAccess(collection, role, "delete")) {
                    test.info().annotations.push({
                        type: "skipped",
                        description: `${collection.labels.collection}: ${role} cannot delete records`,
                    })
                    createdFromCalendar.shift()
                    continue
                }
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await deleteCalendarRecord(page, ui, collection, calendar, id)
                })
                createdFromCalendar.shift()
            }
        })
    })
}

const calendarCollections = async (
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

const createableCalendars = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
) => {
    const visible = await calendarCollections(schema, role, options)
    const createable: CalendarCollection[] = []
    for (const entry of visible) {
        if (await canCreate(entry.collection, role, project)) createable.push(entry)
    }
    return createable
}

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
    const visible = await calendarCollections(schema, role, options)
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

const visibleDays = (page: Page): Promise<string[]> =>
    calendarRoot(page)
        .locator("[data-date]:not(.fc-day-other)")
        .evaluateAll((cells) =>
            [...new Set(cells.map((cell) => cell.getAttribute("data-date")?.slice(0, 10) ?? ""))]
                .filter(Boolean)
                .sort(),
        )

const showCalendarDate = async (page: Page, date: string): Promise<string[]> => {
    for (let step = 0; step < 200; step++) {
        const shown = await visibleDays(page)
        if (shown.includes(date)) return shown
        await calendarRoot(page)
            .locator(date < shown[0] ? ".fc-prev-button" : ".fc-next-button")
            .click()
        await expect.poll(() => visibleDays(page)).not.toEqual(shown)
    }
    throw new Error(`Calendar never showed ${date}`)
}

const slotCells = (page: Page, date: string) => calendarRoot(page).locator(`.fc-timeline-body td[data-date^="${date}"]`)

const dayCells = (page: Page, date: string) =>
    slotCells(page, date).or(calendarRoot(page).locator(`.fc-daygrid-day[data-date="${date}"]`))

const dayCell = (page: Page, date: string) => dayCells(page, date).first()

const isTimeline = async (page: Page) => (await calendarRoot(page).locator(".fc-timeline-body").count()) > 0

type DragOrigin = "center" | "start" | "end"

const centreInTimeline = (to: Locator) =>
    to.evaluate(
        (target) =>
            new Promise<void>((resolve) => {
                const scroller = target.closest(".fc-scroller")
                if (scroller) {
                    const cell = target.getBoundingClientRect()
                    const view = scroller.getBoundingClientRect()
                    scroller.scrollLeft += cell.left + cell.width / 2 - (view.left + view.width / 2)
                }
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            }),
    )

const drag = async (page: Page, from: Locator, to: Locator, origin: DragOrigin = "center", row?: Locator) => {
    const timeline = await to.evaluate((cell) => cell.classList.contains("fc-timeline-slot"))
    await from.scrollIntoViewIfNeeded()
    if (!timeline) await to.scrollIntoViewIfNeeded()
    const source = await from.boundingBox()
    const lane = row ? await row.boundingBox() : null
    if (!source) throw new Error("Calendar drag source is not visible")
    const startX =
        origin === "start"
            ? source.x + 12
            : origin === "end"
              ? source.x + source.width - 4
              : source.x + source.width / 2
    const startY = lane ? lane.y + lane.height / 2 : source.y + source.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    if (timeline) {
        await page.mouse.move(startX + 10, startY)
        await centreInTimeline(to)
    }
    const target = await to.boundingBox()
    const viewport = page.viewportSize()
    if (!target || (viewport && (target.x < 0 || target.x + target.width > viewport.width))) {
        await page.mouse.up()
        throw new Error("Calendar drag target is not visible")
    }
    const endX = target.x + target.width / 2
    const endY = timeline ? startY : target.y + target.height / 2
    await page.mouse.move(endX, endY, { steps: 20 })
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

const toDate = (value: unknown): Date | undefined => {
    if (!value || typeof value !== "object" || !("toDate" in value) || typeof value.toDate !== "function") return
    return value.toDate() as Date
}

const dateStamp = (value: unknown): string | undefined => {
    const date = toDate(value)
    if (!date) return
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Melbourne",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date)
}

const collectionDocs = async (collection: CollectionSchema) => (await tenantCollection(collection).get()).docs

const recordById = (collection: CollectionSchema, id: string) => tenantCollection(collection).doc(id).get()

const titleOf = (collection: CollectionSchema, doc: DocumentSnapshot | undefined) => {
    const value = doc?.get(collection.recordTitleField)
    return typeof value === "string" ? value : undefined
}

const createdRecord = async (collection: CollectionSchema, existing: Set<string>) =>
    (await collectionDocs(collection)).find((doc) => !existing.has(doc.id))

const recordEvents = (page: Page, id: string) => calendarRoot(page).locator(`.fc-event[data-record-id="${id}"]`)

const expectRecordDate = async (collection: CollectionSchema, id: string, field: string, date: string) => {
    await expect
        .poll(async () => dateStamp((await recordById(collection, id)).get(field)), { timeout: 30000 })
        .toBe(date)
}

interface Box {
    x: number
    y: number
    width: number
    height: number
}

const INSET = 4

const dayBox = (page: Page, date: string): Promise<Box | undefined> =>
    dayCells(page, date).evaluateAll((cells) => {
        const rects = cells.map((cell) => cell.getBoundingClientRect())
        if (rects.length === 0) return undefined
        const x = Math.min(...rects.map((rect) => rect.left))
        const y = Math.min(...rects.map((rect) => rect.top))
        return {
            x,
            y,
            width: Math.max(...rects.map((rect) => rect.right)) - x,
            height: Math.max(...rects.map((rect) => rect.bottom)) - y,
        }
    })

const overlapsDay = (eventBox: Box, day: Box) =>
    eventBox.y < day.y + day.height &&
    eventBox.y + eventBox.height > day.y &&
    eventBox.x < day.x + day.width - INSET &&
    eventBox.x + eventBox.width > day.x + INSET

const eventCovers = async (page: Page, id: string, date: string) => {
    const day = await dayBox(page, date)
    if (!day) return false
    const events = recordEvents(page, id)
    const count = await events.count()
    for (let index = 0; index < count; index++) {
        const eventBox = await events.nth(index).boundingBox()
        if (eventBox && overlapsDay(eventBox, day)) return true
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
    let start = "2026-06-08"
    await showCalendar(page, ui, collection, calendar)
    let days = await showCalendarDate(page, start)
    const timeline = await isTimeline(page)
    const lanes = calendarRoot(page).locator(".fc-timeline-lane")
    if (timeline && (await lanes.count()) === 0) {
        // eslint-disable-next-line security/detect-object-injection
        const seededValue = project.records[collection.labels.collection]?.[calendar.startField]
        const seeded = (seededValue?.update || seededValue?.create || "").slice(0, 10)
        if (DATE.test(seeded)) {
            days = await showCalendarDate(page, seeded)
            start = days.find((day) => day > seeded) ?? days.find((day) => day !== seeded) ?? seeded
        }
        if ((await lanes.count()) === 0) {
            throw new Error(`${collection.labels.collection} calendar has no resource row to add on`)
        }
    }
    const dragTo = timeline ? start : addDays(start, 3)
    if (timeline) {
        const slots = slotCells(page, start)
        const last = (await slots.count()) - 1
        await drag(page, slots.nth(Math.min(8, last)), slots.nth(Math.min(16, last)), "center", lanes.first())
    } else if (calendar.endField) {
        await drag(page, dayCell(page, start), dayCell(page, dragTo))
    } else {
        await dayCell(page, start).click()
    }

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
    const startControl = await detectControl(dialog.getByTestId(`field-${calendar.startField}`))
    await expectField(dialog.getByTestId(`field-${calendar.startField}`), startControl, start)
    let end: string | undefined
    if (calendar.endField) {
        const endField = dialog.getByTestId(`field-${calendar.endField}`)
        const shown = await shownDay(endField, await detectControl(endField))
        const dayNumber = (date: string) => String(Number(date.slice(8, 10)))
        const acceptedDays = [dayNumber(dragTo), dayNumber(addDays(dragTo, -1))]
        const endDay = shown.find((day) => acceptedDays.includes(day))
        expect(
            endDay,
            `${collection.labels.collection} end should be ${acceptedDays.join(" or ")}, not ${shown.join(" ")}`,
        ).toBeDefined()
        end = endDay === dayNumber(dragTo) ? dragTo : addDays(dragTo, -1)
    }

    const context: FormContext = {
        rootDir: project.rootDir,
        assignsFilePermissions: assignsFilePermissions(collection, role),
    }
    // eslint-disable-next-line security/detect-object-injection
    const fixture = project.records[collection.labels.collection]
    const fixtureTitled = calendarTitle(project, collection, role)
    const title = fixtureTitled ?? ""
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
    const existing = new Set((await collectionDocs(collection)).map((doc) => doc.id))
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 120000 })
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    let created: DocumentSnapshot | undefined
    await expect
        .poll(
            async () => {
                created = await createdRecord(collection, existing)
                return titleOf(collection, created)
            },
            { timeout: 30000 },
        )
        .toBeTruthy()
    if (!created) throw new Error(`${collection.labels.collection} record was not created from the calendar`)
    const createdId = created.id
    createdFromCalendar.push({ collection, calendar, id: createdId })
    const createdEvent = recordEvents(page, createdId).first()
    await expect(createdEvent).toBeVisible({ timeout: 30000 })
    await expect.poll(() => eventCovers(page, createdId, start)).toBe(true)
    await expectRecordDate(collection, createdId, calendar.startField, start)
    if (end && calendar.endField) {
        await expect.poll(() => eventCovers(page, createdId, end)).toBe(true)
        await expectRecordDate(collection, createdId, calendar.endField, end)
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

const locateEvent = async (
    project: StokerProject,
    collection: CollectionSchema,
    calendar: CalendarConfig,
    role: string,
) => {
    try {
        const saved = await fixtureRecord(project, collection, role)
        const data = saved.data()
        const savedTitle = titleOf(collection, saved)
        if (data && savedTitle && shownOnCalendar(calendar, data)) return { title: savedTitle, record: saved }
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("has no record")) throw error
    }
    const shown = (await collectionDocs(collection)).filter((doc) => shownOnCalendar(calendar, doc.data()))
    const names = [calendarTitle(project, collection, role), fixtureTitle(project, collection)].filter(
        (name) => name !== undefined,
    )
    for (const name of names) {
        const doc = shown.find((doc) => titleOf(collection, doc) === name)
        if (doc) return { title: name, record: doc }
    }
    const doc = shown.find((doc) => titleOf(collection, doc))
    const title = titleOf(collection, doc)
    if (!doc || !title) throw new Error(`${collection.labels.collection} has no event to update`)
    return { title, record: doc }
}

const neighbour = (days: string[], date: string, earlier: boolean) => {
    const index = days.indexOf(date)
    const [preferred, fallback] = earlier ? [days[index - 1], days[index + 1]] : [days[index + 1], days[index - 1]]
    return preferred ?? fallback
}

const shiftedEnd = (record: DocumentSnapshot, moved: DocumentSnapshot, startField: string, endField: string) => {
    const [from, to, end] = [record.get(startField), moved.get(startField), record.get(endField)].map(toDate)
    if (!from || !to || !end) return
    return dateStamp({ toDate: () => new Date(end.getTime() + to.getTime() - from.getTime()) })
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
    await showCalendar(page, ui, collection, calendar)
    const days = await showCalendarDate(page, start)
    const starting = recordEvents(page, record.id).and(page.locator(".fc-event-start"))
    const event = ((await starting.count()) > 0 ? starting : recordEvents(page, record.id)).first()
    await expect(event).toBeVisible({ timeout: 30000 })
    const timeline = await isTimeline(page)
    const drop = neighbour(days, start, timeline)
    if (!drop) throw new Error(`${collection.labels.collection} calendar only shows ${start}`)
    const target = drop < start ? dayCells(page, drop).last() : dayCell(page, drop)
    const before = await ui.record.updated.count()
    await drag(page, event, target, calendar.endField ? "start" : "center")
    await expect.poll(() => ui.record.updated.count(), { timeout: 60000 }).toBeGreaterThan(before)
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    await expectRecordDate(collection, record.id, calendar.startField, drop)
    const moved = await recordById(collection, record.id)
    await expect.poll(() => eventCovers(page, record.id, drop)).toBe(true)
    if (calendar.endField && record.get(calendar.endField)) {
        const end = shiftedEnd(record, moved, calendar.startField, calendar.endField)
        if (!end) throw new Error(`${collection.labels.collection} "${title}" was not moved`)
        await expectRecordDate(collection, record.id, calendar.endField, end)
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
    const { record } = await locateEvent(project, collection, calendar, role)
    const start = dateStamp(record.get(calendar.startField))
    const end = dateStamp(record.get(endField))
    if (!start || !end) throw new Error(`${collection.labels.collection} has no event to resize`)
    await showCalendar(page, ui, collection, calendar)
    const days = await showCalendarDate(page, end)
    const ending = recordEvents(page, record.id).and(page.locator(".fc-event-end"))
    const event = ((await ending.count()) > 0 ? ending : recordEvents(page, record.id)).first()
    await expect(event).toBeVisible({ timeout: 30000 })
    const previous = days[days.indexOf(end) - 1]
    const resized = days[days.indexOf(end) + 1] ?? (previous >= start ? previous : undefined)
    if (!resized) throw new Error(`${end} cannot be resized without moving before ${start}`)
    await event.hover()
    const handle = event.locator(".fc-event-resizer-end")
    const before = await ui.record.updated.count()
    await drag(page, (await handle.count()) > 0 ? handle : event, dayCell(page, resized), "end")
    await expect.poll(() => ui.record.updated.count(), { timeout: 60000 }).toBeGreaterThan(before)
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    const accepted = new Set([resized, addDays(resized, -1)])
    let saved: DocumentSnapshot | undefined
    await expect
        .poll(
            async () => {
                saved = await recordById(collection, record.id)
                return accepted.has(dateStamp(saved.get(endField)) ?? "")
            },
            { timeout: 30000 },
        )
        .toBe(true)
    const savedEnd = dateStamp(saved?.get(endField)) ?? resized
    await expect.poll(() => eventCovers(page, record.id, savedEnd)).toBe(true)
    await expectRecordDate(collection, record.id, calendar.startField, start)
}

const deleteCalendarRecord = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    calendar: CalendarConfig,
    id: string,
) => {
    const doc = await recordById(collection, id)
    const archived = collection.softDelete?.archivedField
    if (!doc.exists || (archived && doc.get(archived) === true)) return
    const start = dateStamp(doc.get(calendar.startField))
    if (!start) throw new Error(`${collection.labels.collection} added record ${id} is not on the calendar`)
    await showCalendar(page, ui, collection, calendar)
    await showCalendarDate(page, start)
    const event = recordEvents(page, id).first()
    await expect(event).toBeVisible({ timeout: 30000 })
    await event.click()
    const details = page.getByRole("button", { name: "Details", exact: true }).filter({ visible: true })
    await expect(details.first()).toBeVisible({ timeout: 30000 })
    if (!page.url().includes("/edit")) await details.first().click()
    await expect(ui.record.form).toBeVisible()
    const remove = page.getByRole("button", { name: "Delete", exact: true })
    await expect(remove).toBeEnabled({ timeout: 30000 })
    await remove.click()
    if (!collection.softDelete) {
        const alert = page.getByRole("alertdialog")
        await expect(alert.getByRole("heading", { name: "Are you absolutely sure?", exact: true })).toBeVisible()
        await alert.getByRole("button", { name: "Permanently Delete", exact: true }).click()
    }
    await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0", { timeout: 60000 })
    await expect
        .poll(
            async () => {
                const saved = await recordById(collection, id)
                if (!saved.exists) return true
                return archived ? saved.get(archived) === true : false
            },
            { timeout: 30000 },
        )
        .toBe(true)
}

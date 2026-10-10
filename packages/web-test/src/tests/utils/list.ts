import type { CollectionSchema } from "@stoker-platform/types"
import type { Locator, Page } from "@playwright/test"
import { expect } from "../../config/fixtures.js"
import type { StokerLocators } from "../../config/locators.js"
import { fixtureRecordId } from "../../config/records.js"
import type { StokerProject } from "../../config/project.js"
import { collectionPath, recordPath } from "../../config/schema.js"

export const openList = async (ui: StokerLocators): Promise<void> => {
    if (await ui.collection.listTab.isVisible()) {
        await ui.collection.listTab.click()
    }
    await expect(ui.collection.table).toBeVisible()
}

export const openActions = async (page: Page, ui: StokerLocators, collection: CollectionSchema) => {
    await openCollection(page, ui, collection)
    if (await ui.collection.listTab.isVisible()) {
        await ui.collection.listTab.click()
    }
}

export const setFiltersToAll = async (page: Page) => {
    const filterButton = page.getByRole("button", { name: "Filter", exact: true })
    if (!(await filterButton.isVisible())) return
    await filterButton.click()
    const sheet = page.getByRole("dialog").filter({
        has: page.getByRole("heading", { name: "Filters", exact: true }),
    })
    await expect(sheet).toBeVisible()
    for (const role of ["button", "radio"] as const) {
        const choices = sheet.getByRole(role, { name: "All", exact: true })
        const count = await choices.count()
        for (let index = 0; index < count; index++) {
            const choice = choices.nth(index)
            if (await choice.isEnabled()) await choice.click()
        }
    }
    await sheet.getByRole("button", { name: "Close", exact: true }).click()
    await expect(sheet).toBeHidden()
}

export const selectMonthRange = async (page: Page, ui: StokerLocators) => {
    await ui.collection.range.label.click()
    const popover = page.getByRole("dialog").filter({ has: page.getByRole("tab") })
    await expect(popover).toBeVisible()
    const monthTab = popover.getByRole("tab", { name: "Month", exact: true })
    if ((await monthTab.count()) === 0) {
        await page.keyboard.press("Escape")
        await expect(popover).toBeHidden()
        return
    }
    await monthTab.click()
    await page.keyboard.press("Escape")
    await expect(popover).toBeHidden()
    await expect(ui.collection.range.previous).toBeVisible()
}

export const showMonth = async (ui: StokerLocators, date: string) => {
    const target = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1
    const shownMonth = async () => {
        const label = await ui.collection.range.label.innerText()
        const shown = new Date(label.split(" - ")[0])
        return shown.getFullYear() * 12 + shown.getMonth()
    }
    const steps = target - (await shownMonth())
    const control = steps > 0 ? ui.collection.range.next : ui.collection.range.previous
    for (let step = 0; step < Math.abs(steps); step++) {
        const before = await shownMonth()
        await control.click()
        await expect.poll(shownMonth).not.toBe(before)
    }
}

export const openCollection = async (page: Page, ui: StokerLocators, collection: CollectionSchema) => {
    await page.goto(collectionPath(collection))
    await expect(ui.collection.heading).toBeVisible({ timeout: 30000 })
}

export const openCollectionList = async (page: Page, ui: StokerLocators, collection: CollectionSchema) => {
    await openCollection(page, ui, collection)
    await openList(ui)
}

export const showAllRecords = async (page: Page, ui: StokerLocators) => {
    if (await ui.collection.showAll.isVisible()) await ui.collection.showAll.check()
    await setFiltersToAll(page)
}

export const showListMonth = async (page: Page, ui: StokerLocators, date?: string) => {
    if (!date || !(await ui.collection.range.label.isVisible())) return
    await selectMonthRange(page, ui)
    if (await ui.collection.range.previous.isVisible()) await showMonth(ui, date)
}

export const waitForRecord = async (page: Page, ui: StokerLocators, collection: CollectionSchema) => {
    const segment = `/${collection.labels.record.toLowerCase()}/`
    await page.waitForURL((url) => url.pathname.toLowerCase().includes(segment))
    await expect(ui.record.heading).toHaveText(/\S/, { timeout: 30000 })
}

export const openRecordRow = async (page: Page, ui: StokerLocators, collection: CollectionSchema, row: Locator) => {
    await row.getByTestId("list-cell").first().click()
    await waitForRecord(page, ui, collection)
}

export const openFixtureRecord = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    project: StokerProject,
    role: string,
) => {
    await page.goto(recordPath(collection, await fixtureRecordId(project, collection, role)))
    await waitForRecord(page, ui, collection)
}

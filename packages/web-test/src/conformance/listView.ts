import type { Page } from "@playwright/test"
import { expect } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"

export const openList = async (ui: StokerLocators): Promise<void> => {
    if (await ui.collection.listTab.isVisible()) {
        await ui.collection.listTab.click()
    }
    await expect(ui.collection.table).toBeVisible()
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

import { expect } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"

export const openList = async (ui: StokerLocators): Promise<void> => {
    if (await ui.collection.listTab.isVisible()) {
        await ui.collection.listTab.click()
    }
    await expect(ui.collection.table).toBeVisible()
}

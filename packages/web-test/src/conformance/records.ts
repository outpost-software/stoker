import { expect, test } from "../fixtures.js"
import { collectionPath, listableCollections } from "../schema.js"
import { openList } from "./listView.js"
import { included, type ConformanceOptions } from "./options.js"

export const recordConformance = (options: ConformanceOptions) => {
    test.describe("record pages", () => {
        test("the first record of each collection opens", async ({ page, schema, role, ui }) => {
            const collections = included(listableCollections(schema, role), options)
            test.skip(collections.length === 0, `${role} cannot read any collection`)

            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await page.goto(collectionPath(collection))
                    await expect(ui.collection.heading).toBeVisible()
                    await openList(ui)
                    if (await ui.collection.empty.isVisible()) return

                    const recordSegment = `/${collection.labels.record.toLowerCase()}/`
                    await ui.collection.rows.first().click()
                    await page.waitForURL((url) => url.pathname.toLowerCase().includes(recordSegment))
                    await expect(ui.record.heading).toBeVisible()
                    await expect(ui.app.errorPage).toBeHidden()
                })
            }
        })
    })
}

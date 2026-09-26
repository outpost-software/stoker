import { expect, test } from "../fixtures.js"
import { collectionPath, listableCollections } from "../schema.js"
import { openList } from "./listView.js"
import { included, type ConformanceOptions } from "./options.js"

export const collectionConformance = (options: ConformanceOptions) => {
    test.describe("collection pages", () => {
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

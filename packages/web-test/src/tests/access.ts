import { expect, test } from "../config/fixtures.js"
import { collectionPath, getRootCollections } from "../config/schema.js"
import { included, skipCollection, type ConformanceOptions } from "../config/options.js"
import { roleHasOperationAccess } from "@stoker-platform/utils"

export const accessConformance = (options: ConformanceOptions) => {
    test.describe("access matrix", () => {
        test("collection routes match the schema for this role", async ({ page, schema, role, ui }) => {
            for (const collection of included(getRootCollections(schema), options)) {
                const name = collection.labels.collection
                if (skipCollection(options, role, name)) continue
                const readable = roleHasOperationAccess(collection, role, "read")
                const path = collectionPath(collection)
                const message = `${role} should${readable ? "" : " not"} be able to read ${name}`
                const onCollectionRoute = (url: URL) => url.pathname === path || url.pathname.startsWith(`${path}/`)
                await page.goto(path)
                if (readable) {
                    await expect(ui.collection.heading, message).toBeVisible()
                    await expect(page, message).toHaveURL(onCollectionRoute)
                } else {
                    await expect(page, message).not.toHaveURL(onCollectionRoute)
                }
            }
        })
    })
}

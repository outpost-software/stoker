import { expect, test } from "../config/fixtures.js"
import { collectionPath, getRootCollections } from "../config/schema.js"
import { included, type ConformanceOptions } from "../config/options.js"
import { roleHasOperationAccess } from "@stoker-platform/utils"

export const accessConformance = (options: ConformanceOptions) => {
    test.describe("access matrix", () => {
        test("collection routes match the schema for this role", async ({ page, schema, role, ui }) => {
            for (const collection of included(getRootCollections(schema), options)) {
                const name = collection.labels.collection
                const readable = roleHasOperationAccess(collection, role, "read")
                await page.goto(collectionPath(collection))
                await expect(
                    ui.collection.heading,
                    `${role} should${readable ? "" : " not"} be able to read ${name}`,
                ).toBeVisible({ visible: readable })
            }
        })
    })
}

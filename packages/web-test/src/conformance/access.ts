import { expect, test } from "../fixtures.js"
import { collectionPath, getRootCollections, roleCanAccess } from "../schema.js"
import { included, type ConformanceOptions } from "./options.js"

export const accessConformance = (options: ConformanceOptions) => {
    test.describe("access matrix", () => {
        test("collection routes match the schema for this role", async ({ page, schema, role, ui }) => {
            for (const collection of included(getRootCollections(schema), options)) {
                const name = collection.labels.collection
                const readable = roleCanAccess(collection, role, "read")
                await page.goto(collectionPath(collection))
                await expect(
                    ui.collection.heading,
                    `${role} should${readable ? "" : " not"} be able to read ${name}`,
                ).toBeVisible({ visible: readable })
            }
        })
    })
}

import { CollectionsSchema } from "@stoker-platform/types"
import { generateSchema } from "../schema/generateSchema.js"
import { lintSchema } from "../../lint/lintSchema.js"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { writeFileSync } from "fs"

export const generateStorageRules = async () => {
    if (!process.env.URL_STORAGE_RULES) {
        throw new Error("STOKER_STORAGE_RULES_URL is not set")
    }

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    const schema: CollectionsSchema = await generateSchema()

    await lintSchema(true)

    const rulesResponse = await fetch(process.env.URL_STORAGE_RULES, {
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ schema }),
        method: "POST",
    })
    const rules = await rulesResponse.text()

    writeFileSync(resolve(__dirname, process.cwd(), "firebase-rules", "storage.rules"), rules)
}

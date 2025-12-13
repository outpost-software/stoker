import { CollectionsSchema } from "@stoker-platform/types"
import { generateSchema } from "../schema/generateSchema.js"
import { lintSchema } from "../../lint/lintSchema.js"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { writeFileSync } from "fs"

export const generateFirestoreIndexes = async () => {
    if (!process.env.URL_FIRESTORE_INDEXES) {
        throw new Error("STOKER_FIRESTORE_INDEXES_URL is not set")
    }

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    const schema: CollectionsSchema = await generateSchema()

    await lintSchema(true)

    const indexesResponse = await fetch(process.env.URL_FIRESTORE_INDEXES, {
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ schema }),
        method: "POST",
    })
    const indexes = await indexesResponse.json()

    writeFileSync(
        resolve(__dirname, process.cwd(), "firebase-rules", "firestore.indexes.json"),
        JSON.stringify(indexes, null, 4),
    )
}

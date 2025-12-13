import { CollectionsSchema } from "@stoker-platform/types"
import { generateSchema } from "../schema/generateSchema.js"
import { lintSchema } from "../../lint/lintSchema.js"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"
import { readFileSync, writeFileSync } from "fs"

export const generateFirestoreRules = async () => {
    if (!process.env.URL_FIRESTORE_RULES) {
        throw new Error("STOKER_FIRESTORE_RULES_URL is not set")
    }

    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    const schema: CollectionsSchema = await generateSchema()

    await lintSchema(true)

    const rulesResponse = await fetch(process.env.URL_FIRESTORE_RULES, {
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ schema }),
        method: "POST",
    })
    let rules = await rulesResponse.text()

    const customRules = readFileSync(
        resolve(__dirname, process.cwd(), "firebase-rules", "firestore.custom.rules"),
        "utf8",
    )

    const trimLastTwoBraces = (input: string) => {
        let trimmed = input.trimEnd()
        let numTrimmed = 0
        while (numTrimmed < 2 && trimmed.endsWith("}")) {
            trimmed = trimmed.slice(0, -1).trimEnd()
            numTrimmed++
        }
        return trimmed
    }
    rules = trimLastTwoBraces(rules)
    rules = `${rules}\n\n        // CUSTOM SECURITY RULES\n\n        ${customRules.split("\n").join("\n        ")}\n    }\n}`

    writeFileSync(resolve(__dirname, process.cwd(), "firebase-rules", "firestore.rules"), rules)
}

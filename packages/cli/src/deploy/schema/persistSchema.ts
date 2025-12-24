import { getDatabase } from "firebase-admin/database"
import { initializeFirebase } from "@stoker-platform/node-client"
import { generateSchema } from "./generateSchema.js"
import { lintSchema } from "../../lint/lintSchema.js"

export const persistSchema = async () => {
    await initializeFirebase()
    const rtdb = getDatabase()

    const ref = rtdb.ref("schema")

    const schema = await generateSchema(true)

    await lintSchema(true)

    await ref.push(schema)
    console.info("Schema persisted successfully.")
    process.exit()
}

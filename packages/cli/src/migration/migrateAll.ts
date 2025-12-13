import { initializeFirebase, fetchLastSchema } from "@stoker-platform/node-client"
import { join } from "path"
import { mkdir, writeFile } from "fs/promises"
import { existsSync } from "fs"
import { migrateFirestore } from "./firestore/migrateFirestore.js"
import { CollectionsSchema } from "@stoker-platform/types"
import { generateSchema } from "../deploy/schema/generateSchema.js"

export const migrateAll = async () => {
    await initializeFirebase()

    const currentSchema: CollectionsSchema = await generateSchema()
    const lastSchema: CollectionsSchema | undefined = await fetchLastSchema()

    console.log("Migration started...")

    if (isNaN(currentSchema.version)) {
        throw new Error("Invalid version number")
    }

    const date = new Date()
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, security/detect-non-literal-fs-filename
    const migrationDir = join(process.cwd(), ".migration", process.env.GCP_PROJECT!)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const migrationDirExists = existsSync(migrationDir)
    if (!migrationDirExists) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await mkdir(migrationDir, { recursive: true })
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, security/detect-non-literal-fs-filename
    const filePath = join(process.cwd(), ".migration", process.env.GCP_PROJECT!, `v${currentSchema.version.toString()}`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(filePath, `${date.toUTCString()}\n\n`)
    await migrateFirestore(currentSchema, lastSchema)

    process.exit()
}

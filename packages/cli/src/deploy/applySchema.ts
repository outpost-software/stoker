import { runChildProcess } from "@stoker-platform/node-client"
import { getFunctionsData } from "./cloud-functions/getFunctionsData.js"
import { generateSchema } from "./schema/generateSchema.js"
import { readdir, readFile, writeFile } from "fs/promises"
import { join } from "path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const applySchema = async () => {
    try {
        await runChildProcess("npm", ["run", "format"])
        await runChildProcess("npm", ["run", "lint"])
        await runChildProcess("npm", ["run", "build"])
        await runChildProcess("npm", ["run", "test"])

        await runChildProcess("npx", ["stoker", "lint-schema"])
        await runChildProcess("npx", ["stoker", "security-report"])

        await runChildProcess("npx", ["stoker", "generate-firestore-rules"])
        await runChildProcess("npx", ["stoker", "generate-storage-rules"])

        const schema = await generateSchema(true)
        const emulatorExportDir = join(process.cwd(), "firebase-emulator-data", "database_export")
        const exportFiles = await readdir(emulatorExportDir)
        const targetFile = exportFiles[0]
        if (!targetFile) throw new Error("No emulator RTDB export file found in database_export directory")
        const targetPath = join(emulatorExportDir, targetFile)

        let emulatorData: Record<string, unknown> = {}
        try {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            const currentContent = await readFile(targetPath, "utf8")
            emulatorData = JSON.parse(currentContent)
        } catch {
            emulatorData = {}
        }

        schema.published_time = Date.now()
        emulatorData.schema = { "1": schema }
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await writeFile(targetPath, JSON.stringify(emulatorData, null, 4))

        await getFunctionsData()

        process.exit()
    } catch (error) {
        throw new Error("Error applying schema.", { cause: error })
    }
}

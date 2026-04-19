import { initializeFirebase, runChildProcess } from "@stoker-platform/node-client"
import { getFunctionsData } from "../cloud-functions/getFunctionsData.js"
import { generateSchema } from "../schema/generateSchema.js"
import { readFile } from "fs/promises"
import { join } from "path"
import { getDatabase } from "firebase-admin/database"

const DEFAULT_RTDB_PORT = 9000

const getEmulatorHost = async (): Promise<string> => {
    const firebaseConfigString = await readFile(join(process.cwd(), "firebase.json"), "utf8")
    const firebaseConfig = JSON.parse(firebaseConfigString)
    const port = firebaseConfig?.emulators?.database?.port ?? DEFAULT_RTDB_PORT
    return `127.0.0.1:${port}`
}

const isEmulatorRunning = async (host: string): Promise<boolean> => {
    try {
        const response = await fetch(`http://${host}/.json?shallow=true`)
        return response.ok
    } catch {
        return false
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const updateLiveSchema = async () => {
    try {
        const schema = await generateSchema(true)

        await initializeFirebase()
        const emulatorHost = await getEmulatorHost()
        process.env.FIREBASE_DATABASE_EMULATOR_HOST = emulatorHost

        const updateEmulatorData = await isEmulatorRunning(emulatorHost)
        if (updateEmulatorData) {
            const rtdb = getDatabase()
            const ref = rtdb.ref("schema").child("1")
            await ref.set(schema)
        }

        await getFunctionsData()

        await runChildProcess("npx", ["stoker", "generate-firestore-rules"])
        await runChildProcess("npx", ["stoker", "generate-storage-rules"])

        process.exit()
    } catch (error) {
        throw new Error("Error applying schema.", { cause: error })
    }
}

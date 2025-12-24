import { addRecord as addStokerRecord, initializeStoker } from "@stoker-platform/node-client"
import { join } from "path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const addRecord = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )

    const result = await addStokerRecord(
        options.path.split("/"),
        JSON.parse(options.data),
        options.userData ? JSON.parse(options.userData) : undefined,
        options.user,
    )
    console.log(JSON.stringify(result, null, 2))
    process.exit()
}

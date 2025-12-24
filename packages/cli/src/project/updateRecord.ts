import { updateRecord as updateStokerRecord, initializeStoker } from "@stoker-platform/node-client"
import { join } from "path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const updateRecord = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )

    const updatedRecord = await updateStokerRecord(
        options.path.split("/"),
        options.id,
        JSON.parse(options.data),
        options.userData ? JSON.parse(options.userData) : undefined,
        options.user,
    )
    console.log(JSON.stringify(updatedRecord, null, 2))
    process.exit()
}

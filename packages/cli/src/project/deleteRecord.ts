import { deleteRecord as deleteStokerRecord, initializeStoker } from "@stoker-platform/node-client"
import { join } from "path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteRecord = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )

    const deletedRecord = await deleteStokerRecord(options.path.split("/"), options.id, options.user, {
        force: options.force,
    })
    console.log(JSON.stringify(deletedRecord, null, 2))
    process.exit()
}

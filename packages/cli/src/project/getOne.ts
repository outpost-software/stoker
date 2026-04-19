import { initializeStoker, getOne as getOneStoker, GetOneOptions } from "@stoker-platform/node-client"
import { join } from "path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getOne = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )

    const path = options.path.split("/")
    const id = options.id

    const getOneOptions: GetOneOptions = {}
    if (options.subcollections) {
        getOneOptions.subcollections = {
            depth: options.subcollections as number,
        }
    }
    if (options.relations) {
        getOneOptions.relations = {
            depth: options.relations as number,
        }
    }

    if (options.user) {
        getOneOptions.userId = options.user
    }

    const result = await getOneStoker(path, id, getOneOptions)
    console.log(JSON.stringify(result, null, 2))
    process.exit()
}

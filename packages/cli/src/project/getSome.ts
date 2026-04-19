import { initializeStoker, getSome as getSomeStoker, GetSomeOptions } from "@stoker-platform/node-client"
import { join } from "path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getSome = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )

    const path = options.path.split("/")

    const getSomeOptions: GetSomeOptions = {}
    if (options.constraints) {
        getSomeOptions.constraints = JSON.parse(options.constraints)
    }
    if (options.subcollections) {
        getSomeOptions.subcollections = {
            depth: options.subcollections as number,
        }
    }
    if (options.relations) {
        getSomeOptions.relations = {
            depth: options.relations as number,
        }
    }

    if (options.user) {
        getSomeOptions.userId = options.user
    }

    const result = await getSomeStoker(path, getSomeOptions)
    console.log(JSON.stringify(result.docs, null, 2))
    process.exit()
}

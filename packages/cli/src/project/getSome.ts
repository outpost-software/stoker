import { initializeStoker, getSome as getSomeStoker } from "@stoker-platform/node-client"
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

    let constraints: [string, string, unknown][] = []
    if (options.constraints) {
        constraints = JSON.parse(options.constraints)
    }

    const getSomeOptions = {} as { subcollections: { depth: number }; relations: { depth: number }; user?: string }
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
        getSomeOptions.user = options.user
    }

    const result = await getSomeStoker(path, constraints, getSomeOptions)
    console.log(JSON.stringify(result.docs, null, 2))
    process.exit()
}

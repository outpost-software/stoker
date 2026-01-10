import { initializeFirebase, tryPromise } from "@stoker-platform/node-client"
import { writeFileSync } from "fs"
import { generateSchema } from "../schema/generateSchema.js"
import { join } from "path"
import { GenerateGlobalConfig } from "@stoker-platform/types"
import { pathToFileURL } from "url"

export const getFunctionsData = async () => {
    await initializeFirebase()
    const path = join(process.cwd(), "lib", "main.js")
    const url = pathToFileURL(path).href
    const globalConfigFile = await import(/* @vite-ignore */ url)
    const config: GenerateGlobalConfig = globalConfigFile.default
    const globalConfig = config("node")
    const timezone = await tryPromise(globalConfig.timezone)

    const schema = await generateSchema()

    const filePath = join(process.cwd(), "functions", "project-data.json")
    writeFileSync(filePath, JSON.stringify({ timezone, schema }, null, 2))
    return
}

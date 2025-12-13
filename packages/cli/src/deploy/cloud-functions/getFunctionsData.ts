import { initializeFirebase, tryPromise } from "@stoker-platform/node-client"
import { writeFileSync } from "fs"
import { generateSchema } from "../schema/generateSchema.js"
import { join } from "path"
import { GenerateGlobalConfig } from "@stoker-platform/types"

export const getFunctionsData = async () => {
    await initializeFirebase()
    const configFilePath = join(process.cwd(), "lib", "main.js")
    const globalConfigFile = await import(/* @vite-ignore */ configFilePath)
    const config: GenerateGlobalConfig = globalConfigFile.default
    const globalConfig = config("node")
    const timezone = await tryPromise(globalConfig.timezone)

    const schema = await generateSchema()

    const filePath = join(process.cwd(), "functions", "project-data.json")
    writeFileSync(filePath, JSON.stringify({ timezone, schema }, null, 2))
    return
}

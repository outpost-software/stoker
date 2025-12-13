import { fileURLToPath } from "url"
import { resolve, dirname, join } from "path"
import { existsSync, cpSync, renameSync } from "fs"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const initProject = async (options: any) => {
    if (existsSync("firebase.json") && !options.force) {
        console.log("Please run this command from an empty directory")
        process.exit()
    }
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    cpSync(resolve(__dirname, "..", "..", "..", "init-files"), process.cwd(), { recursive: true })
    renameSync(join(process.cwd(), ".##gitignore##"), join(process.cwd(), ".gitignore"))
    renameSync(join(process.cwd(), "functions", ".##gitignore##"), join(process.cwd(), "functions", ".gitignore"))
    process.exit()
}

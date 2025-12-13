import { runChildProcess } from "@stoker-platform/node-client"

export const buildWebApp = async () => {
    try {
        await runChildProcess("npm", ["exec", "--package=@stoker-platform/web-app", "--", "build-web-app"])
        process.exit()
    } catch {
        throw new Error("Error building the web app.")
    }
}

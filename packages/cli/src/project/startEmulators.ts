import { runChildProcess } from "@stoker-platform/node-client"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const startEmulators = async (options: any = {}) => {
    const args = [
        "--non-interactive",
        "start",
        "--",
        "firebase",
        "emulators:start",
        "--project",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        process.env.GCP_PROJECT!,
        "--import",
        "./firebase-emulator-data",
    ]
    if (options.inspectFunctions) {
        args.push("--inspect-functions")
    }
    try {
        await runChildProcess("genkit", args, undefined, { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: "30" })
        process.exit()
    } catch {
        throw new Error("Error starting the Firebase Emulator Suite.")
    }
}

export const startWebAppEmulators = async () => {
    try {
        await runChildProcess("npm", ["exec", "--package=@stoker-platform/web-app", "--", "start-web-app"])
        process.exit()
    } catch {
        throw new Error("Error starting the Firebase Hosting emulator.")
    }
}

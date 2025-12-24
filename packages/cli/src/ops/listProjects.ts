import { initializeFirebase, runChildProcess } from "@stoker-platform/node-client"

export const listProjects = async () => {
    await initializeFirebase()
    await runChildProcess("gcloud", ["projects", "list"]).catch(() => {
        throw new Error("Error getting Google Cloud projects.")
    })
    process.exit()
}

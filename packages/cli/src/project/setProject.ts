import { runChildProcess } from "@stoker-platform/node-client"

export const setProject = async () => {
    await runChildProcess("gcloud", [
        "auth",
        "application-default",
        "set-quota-project",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        process.env.GCP_PROJECT!,
    ]).catch(() => {
        throw new Error("Error setting quota project.")
    })
    process.exit()
}

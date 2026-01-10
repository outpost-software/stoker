import { fetchCurrentSchema, initializeFirebase, runChildProcess } from "@stoker-platform/node-client"
import { setDeploymentStatus } from "./maintenance/setDeploymentStatus.js"
import { getFunctionsData } from "./cloud-functions/getFunctionsData.js"
import { retryOperation } from "@stoker-platform/utils"
import { generateSchema } from "./schema/generateSchema.js"
import isEqual from "lodash/isEqual.js"
import cloneDeep from "lodash/cloneDeep.js"
import { CollectionsSchema } from "@stoker-platform/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deployProject = async (options: any) => {
    try {
        await initializeFirebase()

        if (options.retry) {
            await runChildProcess("npx", ["stoker", "deployment", "--status", "idle"])
        }

        if (!options.initial) {
            const currentSchema = await generateSchema()
            const lastSchema = await fetchCurrentSchema()
            const currentScemaCopy = cloneDeep(currentSchema) as Omit<
                CollectionsSchema,
                "published_time" | "version"
            > & { version?: number; published_time?: unknown }
            delete currentScemaCopy.published_time
            delete currentScemaCopy.version
            const lastSchemaCopy = cloneDeep(lastSchema) as Omit<CollectionsSchema, "published_time" | "version"> & {
                version?: number
                published_time?: unknown
            }
            delete lastSchemaCopy.published_time
            delete lastSchemaCopy.version

            if (!options.maintenanceOn && !isEqual(currentScemaCopy, lastSchemaCopy)) {
                throw new Error("The schema for this project has changed. Maintenance mode cannot be disabled.")
            }
        }

        await runChildProcess("npm", ["run", "format"])
        await runChildProcess("npm", ["run", "lint"])
        await runChildProcess("npm", ["run", "build"])
        await runChildProcess("npm", ["run", "test"])
        await runChildProcess("npx", ["stoker", "build-web-app"])

        await runChildProcess("npx", ["stoker", "lint-schema"])
        await runChildProcess("npx", ["stoker", "security-report"])

        await setDeploymentStatus("in_progress")

        if (options.maintenanceOn && !options.initial)
            await runChildProcess("npx", ["stoker", "maintenance", "--status", "on"])

        if (options.export) {
            await runChildProcess("npx", ["stoker", "export"])
        }

        if (!options.retry || options.initial) {
            await runChildProcess("npx", ["stoker", "persist-schema"])
        }
        await runChildProcess("npx", ["stoker", "deploy-ttls"])
        await runChildProcess("npx", ["stoker", "generate-firestore-indexes"])
        if (options.firestoreRules) await runChildProcess("npx", ["stoker", "generate-firestore-rules"])
        if (options.storageRules) await runChildProcess("npx", ["stoker", "generate-storage-rules"])
        await getFunctionsData()

        if (options.migrate && !options.initial) {
            await runChildProcess("npx", ["stoker", "migrate"])
        }

        await initializeFirebase()

        if (options.initial) {
            await retryOperation(
                async () => {
                    await runChildProcess("npx", [
                        "firebase",
                        "deploy",
                        "--only",
                        "firestore,database,storage",
                        "--project",
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        process.env.GCP_PROJECT!,
                        "--force",
                    ])
                },
                [],
                undefined,
                10000,
            )
            await retryOperation(
                async () => {
                    const output = await runChildProcess(
                        "npx",
                        [
                            "firebase",
                            "deploy",
                            "--only",
                            "functions",
                            "--project",
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            process.env.GCP_PROJECT!,
                            "--force",
                        ],
                        undefined,
                        { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: "30" },
                    )
                    if (output.includes("HTTP Error: 400")) throw new Error("PERMISSION_DENIED")
                },
                [],
                undefined,
                10000,
            )

            await retryOperation(
                async () => {
                    await runChildProcess("npx", [
                        "firebase",
                        "deploy",
                        "--only",
                        "extensions",
                        "--project",
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        process.env.GCP_PROJECT!,
                        "--force",
                    ])
                },
                [],
                undefined,
                10000,
            )
        } else {
            await runChildProcess(
                "npx",
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                ["firebase", "deploy", "--project", process.env.GCP_PROJECT!, "--force"],
                undefined,
                { ...process.env, FUNCTIONS_DISCOVERY_TIMEOUT: "30" },
            )
        }
        if (options.admin)
            await runChildProcess("npm", ["exec", "--package=@stoker-platform/web-app", "--", "deploy-web-app"])

        const liveUpdateOptions = []
        if (options.secure && !options.initial) liveUpdateOptions.push("--secure")
        if (options.refresh && !options.initial) liveUpdateOptions.push("--refresh")
        await runChildProcess("npx", ["stoker", "live-update", ...liveUpdateOptions])
        if (options.maintenanceOff) await runChildProcess("npx", ["stoker", "maintenance", "--status", "off"])

        await setDeploymentStatus("idle")
        process.exit()
    } catch (error) {
        throw new Error("Error deploying project.", { cause: error })
    }
}

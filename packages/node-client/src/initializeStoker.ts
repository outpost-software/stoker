import {
    CollectionCustomization,
    CollectionsSchema,
    GenerateGlobalConfig,
    GlobalConfig,
    NodeUtilities,
    VersionInfo,
} from "@stoker-platform/types"
import { getCustomization, tryPromise } from "@stoker-platform/utils"
import { initializeApp, getApp, applicationDefault, App } from "firebase-admin/app"
import { DocumentSnapshot } from "firebase-admin/firestore"
import { getStokerFirestore } from "./utils/getStokerFirestore.js"
import cloneDeep from "lodash/cloneDeep.js"
import { getCustomizationFiles } from "./utils/getCustomizationFiles"
import { fetchCurrentSchema } from "./main"
import { pathToFileURL } from "node:url"
import { AsyncLocalStorage, AsyncResource } from "node:async_hooks"

// Do not initialise an object here and then mutate it. Every request will hold the object and will read the mutated value.
const requestScope = new AsyncLocalStorage<string>()

let alsIsolates: boolean | undefined
const alsIsolatesCallbacks = () => {
    if (alsIsolates === undefined) {
        const probe = new AsyncLocalStorage<string>()
        const shared = new AsyncResource("stoker-als-probe")
        shared.runInAsyncScope(() => probe.enterWith("leak"))
        alsIsolates = shared.runInAsyncScope(() => probe.getStore()) === undefined
        probe.disable()
    }
    return alsIsolates
}

const generatorScope = new AsyncLocalStorage<true>()
const runGenerator = <T>(generate: () => T) => generatorScope.run(true, generate)

let app: App,
    mode: "development" | "production",
    timezone: string,
    globalConfig: GlobalConfig,
    customizationFiles: { [key: string]: CollectionCustomization },
    versionInfo: VersionInfo | undefined,
    maintenanceInfo: { active: boolean } | undefined,
    numberOfUpdates = 0,
    initialized = false

const utilities: NodeUtilities = {
    getTenant() {
        if (generatorScope.getStore()) {
            throw new Error("getTenant() must be called from a method or a hook")
        }
        const tenant = requestScope.getStore()
        if (!tenant) throw new Error("Tenant not provided")
        return tenant
    },
    getMode() {
        return mode
    },
    getTimezone() {
        return timezone
    },
    getGlobalConfigModule() {
        return cloneDeep(globalConfig)
    },
    getCustomizationFile(collection: string, schema: CollectionsSchema) {
        if (!Object.keys(schema.collections).includes(collection)) throw new Error("PERMISSION_DENIED")
        const customizationFile = runGenerator(() =>
            getCustomization([collection], customizationFiles, "node", utilities),
        )
        // eslint-disable-next-line security/detect-object-injection
        return cloneDeep(customizationFile?.[collection])
    },
    getVersionInfo() {
        return versionInfo
    },
    getMaintenanceInfo() {
        return maintenanceInfo
    },
    getStokerFirestore,
}

export const initializeStoker = async (
    modeEnv: "development" | "production",
    tenantId: string | undefined,
    configFilePath: string,
    customizationFilesPath: string,
    gcp?: boolean,
) => {
    const alreadyInitialized = !!initialized
    initialized = true
    if (tenantId) {
        if (!requestScope.getStore() && !alsIsolatesCallbacks()) {
            throw new Error(
                "This Node runtime does not isolate async contexts between requests (Node 24+ required).\nWrap the call in runWithTenant()",
            )
        }
        requestScope.enterWith(tenantId)
    }
    mode = modeEnv

    if (app && !gcp) {
        return utilities
    }
    if (!process.env.STOKER_FB_WEB_APP_CONFIG) {
        throw new Error("STOKER_FB_WEB_APP_CONFIG not set.")
    }

    const firebaseConfigString = process.env.STOKER_FB_WEB_APP_CONFIG
    const firebaseConfig = JSON.parse(firebaseConfigString)

    const url = pathToFileURL(configFilePath).href
    const globalConfigFile = await import(/* @vite-ignore */ url)
    const config: GenerateGlobalConfig = globalConfigFile.default
    globalConfig = runGenerator(() => config({ sdk: "node", utils: utilities }))

    if (!gcp && modeEnv === "development") {
        process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
        process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000"
        process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9199"
    }

    try {
        app = getApp()
    } catch {
        app = initializeApp({
            credential: applicationDefault(),
            databaseURL: firebaseConfig.databaseURL,
            storageBucket: firebaseConfig.storageBucket,
            projectId: firebaseConfig.projectId,
        })
    }

    const schema = await fetchCurrentSchema()
    customizationFiles = await getCustomizationFiles(customizationFilesPath, Object.keys(schema.collections))
    timezone = await tryPromise(globalConfig.timezone)

    if (!alreadyInitialized) {
        getStokerFirestore()
            .collection("system_deployment")
            .doc("maintenance_mode")
            .onSnapshot(
                (doc: DocumentSnapshot) => {
                    if (doc.exists) {
                        maintenanceInfo = doc.data() as { active: boolean }
                        tryPromise(globalConfig.onMaintenanceUpdate, ["node", maintenanceInfo.active ? "on" : "off"])
                    } else {
                        console.error("Maintenance status not found")
                    }
                },
                (error) => {
                    console.error(error.message)
                },
            )
    }
    if (!alreadyInitialized) {
        getStokerFirestore()
            .collection("system_deployment")
            .doc("latest_deploy")
            .onSnapshot(
                (doc: DocumentSnapshot) => {
                    if (doc.exists) {
                        versionInfo = doc.data() as VersionInfo
                        numberOfUpdates++
                        if (numberOfUpdates > 1) {
                            tryPromise(globalConfig.onVersionUpdate, ["node", versionInfo, numberOfUpdates])
                        }
                    } else {
                        console.error("Version info not found")
                    }
                },
                (error) => {
                    console.error(error.message)
                },
            )
    }

    await new Promise((resolve) => {
        const checkValues = () => {
            if (maintenanceInfo && versionInfo) {
                resolve(utilities)
            } else {
                setTimeout(checkValues, 100)
            }
        }
        checkValues()
    })

    return utilities
}

export const runWithTenant = <T>(tenantId: string, callback: () => Promise<T>) => requestScope.run(tenantId, callback)

export const {
    getTenant,
    getMode,
    getTimezone,
    getGlobalConfigModule,
    getCustomizationFile,
    getVersionInfo,
    getMaintenanceInfo,
} = utilities

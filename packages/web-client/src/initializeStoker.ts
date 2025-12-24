import { initializeApp, setLogLevel, onLog, registerVersion, FirebaseApp, FirebaseError } from "firebase/app"
import { AnalyticsSettings, ConsentSettings, initializeAnalytics, isSupported, setConsent } from "firebase/analytics"
import {
    connectAuthEmulator,
    onAuthStateChanged,
    Auth,
    Unsubscribe,
    Persistence,
    inMemoryPersistence,
    browserSessionPersistence,
    browserLocalPersistence,
    indexedDBLocalPersistence,
    initializeAuth,
    User,
    beforeAuthStateChanged,
    signOut,
    getIdTokenResult,
    ParsedToken,
} from "firebase/auth"
import { connectDatabaseEmulator, getDatabase } from "firebase/database"
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    connectFirestoreEmulator,
    Firestore,
    terminate,
    memoryLocalCache,
    memoryLruGarbageCollector,
    LogLevel,
    MemoryLocalCache,
    PersistentLocalCache,
    getPersistentCacheIndexManager,
    enablePersistentCacheIndexAutoCreation,
    MemoryLruGarbageCollector,
    MemoryEagerGarbageCollector,
    memoryEagerGarbageCollector,
    persistentSingleTabManager,
    clearIndexedDbPersistence,
    getFirestore,
} from "firebase/firestore"
import { connectStorageEmulator, getStorage } from "firebase/storage"
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions"
import {
    AppCheck,
    AppCheckOptions,
    initializeAppCheck,
    onTokenChanged,
    ReCaptchaEnterpriseProvider,
} from "firebase/app-check"
import { version } from "../package.json"
import type { CollectionsSchema, GlobalConfig, RoleGroup, WebUtilities } from "@stoker-platform/types"
import {
    tryPromise,
    getCachedConfigValue,
    getCustomization,
    clearConfigCache,
    getFieldCustomization,
} from "@stoker-platform/utils"
import { StokerCollection, CollectionCustomization } from "@stoker-platform/types/src/types/schema"
import { getCurrentUserPermissions, clearCurrentUser, initializeUserListeners } from "./read/getUserData.js"
import cloneDeep from "lodash/cloneDeep.js"
import { clearRetrying, retryPendingWrites } from "./retryPendingWrites.js"
import { initializeVersionListener, getVersionInfo } from "./read/getVersionInfo.js"
import { initializeMaintenanceListener, getMaintenanceInfo } from "./read/getMaintenanceInfo.js"
import { getLoadingState } from "./read/cache/preloadCache.js"
import { initializeConnectionStatus, getConnectionStatus, getNetworkStatus } from "./connectionStatus.js"
import { initializeErrorEvents } from "./initializeErrorEvents"
import { getPerformance } from "firebase/performance"
import { fetchAndActivate, getRemoteConfig } from "firebase/remote-config"

declare global {
    // eslint-disable-next-line no-var
    var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined
}
interface Apps {
    firestoreWriteApp: FirebaseApp
}
interface AppCheckInstances {
    main: AppCheck
    firestoreWrite: AppCheck
    maintenance: AppCheck
}
interface AuthInstances {
    main: Auth
    firestoreWrite: Auth
}
interface FirestoreInstances {
    main: Firestore
    firestoreWrite: Firestore
    maintenance: Firestore
}

let app: FirebaseApp,
    tenant: string,
    mode: "development" | "production",
    timezone: string,
    globalConfig: GlobalConfig,
    customizationModules: { [key: string]: CollectionCustomization },
    schema: CollectionsSchema,
    allRoleGroups: Record<StokerCollection, Set<RoleGroup>>,
    currentUserRoleGroups: Record<StokerCollection, RoleGroup>,
    user: User,
    userData: User & { token: { claims: ParsedToken } },
    unsubscribes: Unsubscribe[] = [],
    env: Record<string, string>

const apps: Apps = {
        firestoreWriteApp: {} as FirebaseApp,
    },
    authInstances: AuthInstances = {
        main: {} as Auth,
        firestoreWrite: {} as Auth,
    },
    firestoreInstances: FirestoreInstances = {
        main: {} as Firestore,
        firestoreWrite: {} as Firestore,
        maintenance: {} as Firestore,
    },
    appCheckInstances: AppCheckInstances = {
        main: {} as AppCheck,
        firestoreWrite: {} as AppCheck,
        maintenance: {} as AppCheck,
    }

const utilities: WebUtilities = {
    getTenant() {
        return tenant
    },
    getEnv() {
        return env
    },
    getTimezone() {
        return timezone
    },
    getConnectionStatus,
    getNetworkStatus,
    getSchema(includeComputedFields: boolean = false) {
        const schemaClone = cloneDeep(schema)

        if (!includeComputedFields) {
            for (const collection of Object.values(schemaClone.collections)) {
                collection.fields = collection.fields.filter((field) => field.type !== "Computed")
            }
        } else {
            for (const collection of Object.values(schemaClone.collections)) {
                for (const field of collection.fields) {
                    if (field.type === "Computed") {
                        const fieldCustomization = getFieldCustomization(
                            field,
                            getCollectionConfigModule(collection.labels.collection),
                        )
                        if (fieldCustomization.formula) {
                            field.formula = fieldCustomization.formula
                        }
                    }
                }
            }
        }
        return schemaClone
    },
    getCurrentUser() {
        return userData
    },
    getCurrentUserRoleGroups() {
        return cloneDeep(currentUserRoleGroups)
    },
    getAllRoleGroups() {
        return cloneDeep(allRoleGroups)
    },
    getGlobalConfigModule() {
        return cloneDeep(globalConfig)
    },
    getCollectionConfigModule(collection: StokerCollection) {
        // eslint-disable-next-line security/detect-object-injection
        return cloneDeep(customizationModules[collection])
    },
    getVersionInfo,
    getMaintenanceInfo,
    getCurrentUserPermissions,
    getLoadingState,

    getAppCheck() {
        return appCheckInstances.main
    },
    getAppCheckFirestoreWrite() {
        return appCheckInstances.firestoreWrite
    },

    getFirestoreWriteAuth() {
        return authInstances.firestoreWrite
    },

    getFirestoreWrite() {
        return firestoreInstances.firestoreWrite
    },
    getFirestoreMaintenance() {
        return firestoreInstances.maintenance
    },
}

const clearStokerState = () => {
    tenant = ""
    schema = {} as CollectionsSchema
    allRoleGroups = {} as Record<StokerCollection, Set<RoleGroup>>
    currentUserRoleGroups = {} as Record<StokerCollection, RoleGroup>
    user = {} as User
    clearConfigCache()
    clearCurrentUser()
    clearRetrying()
}

const getUnsubscribes = () => {
    return unsubscribes
}
const clearUnsubscribes = () => {
    unsubscribes = []
}

let errorEventsInitialized = false

export const initializeStoker = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    collectionFiles: any,
    envVars: Record<string, string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
) => {
    env = envVars
    if (app) {
        console.error("Stoker is already initialized.")
        return true
    }
    registerVersion("stoker-client", version, "web")
    mode = env.MODE as "development" | "production"
    globalConfig = config.default("web", utilities, context)

    timezone = (await getCachedConfigValue(globalConfig, ["global", "timezone"])) as string

    getCachedConfigValue(globalConfig, ["global", "roles"])
    getCachedConfigValue(globalConfig, ["global", "appName"])
    getCachedConfigValue(globalConfig, ["global", "auth", "enableMultiFactorAuth"])

    // Initialize Firebase Apps

    const firebaseConfig = JSON.parse(env.STOKER_FB_WEB_APP_CONFIG)
    const firebaseGDPR = (await getCachedConfigValue(globalConfig, ["global", "firebase", "GDPRSettings"])) as boolean
    app = initializeApp(firebaseConfig, {
        automaticDataCollectionEnabled: firebaseGDPR || true,
    })

    const perf = getPerformance(app)
    if (mode === "development") {
        perf.instrumentationEnabled = false
        perf.dataCollectionEnabled = false
    }

    const appNames = ["firestoreWrite"]
    for (const appName of appNames) {
        apps[`${appName}App` as keyof Apps] = initializeApp(firebaseConfig, appName)
    }
    const { firestoreWriteApp } = apps

    const maintenanceApp = initializeApp(firebaseConfig, "maintenance")
    firestoreInstances.maintenance = getFirestore(maintenanceApp)

    const remoteConfig = getRemoteConfig()
    remoteConfig.settings.minimumFetchIntervalMillis = 3600000
    await fetchAndActivate(remoteConfig)

    // Initialize Firebase App Check

    if (env.STOKER_FB_ENABLE_APP_CHECK === "true") {
        if (env.STOKER_FB_APP_CHECK_KEY) {
            if (mode === "development" || window.location.hostname === "localhost") {
                globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true
            }
            const appCheckSettings: AppCheckOptions = {
                provider: new ReCaptchaEnterpriseProvider(env.STOKER_FB_APP_CHECK_KEY),
                isTokenAutoRefreshEnabled: true,
            }
            appCheckInstances.main = initializeAppCheck(app, appCheckSettings)
            appCheckInstances.firestoreWrite = initializeAppCheck(firestoreWriteApp, appCheckSettings)
            appCheckInstances.maintenance = initializeAppCheck(maintenanceApp, appCheckSettings)

            let reloadTriggered = false

            const reloadAppCheck = (error: FirebaseError, instance: string) => {
                console.log(`App Check token error detected for ${instance}`)
                if (reloadTriggered) {
                    return
                }
                reloadTriggered = true
                if (globalConfig.onAppCheckTokenFailure) {
                    tryPromise(globalConfig.onAppCheckTokenFailure, [error])
                } else {
                    const hasReloaded = sessionStorage.getItem("stoker-app-check-reload")
                    if (!hasReloaded || new Date(hasReloaded).getTime() < Date.now() - 300000) {
                        sessionStorage.setItem("stoker-app-check-reload", new Date().toISOString())
                        window.location.reload()
                    } else {
                        alert("For security reasons, please close this tab and wait a while before restarting it.")
                    }
                }
            }

            onTokenChanged(
                appCheckInstances.main,
                () => {},
                (error) => reloadAppCheck(error as FirebaseError, "main"),
            )
            onTokenChanged(
                appCheckInstances.firestoreWrite,
                () => {},
                (error) => reloadAppCheck(error as FirebaseError, "firestoreWrite"),
            )
            onTokenChanged(
                appCheckInstances.maintenance,
                () => {},
                (error) => reloadAppCheck(error as FirebaseError, "maintenance"),
            )
        } else new Error("App Check Key is not provided.")
    }

    // Initialize Stoker Configuration

    const enableAnalytics = (await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "enableAnalytics",
    ])) as boolean
    const analyticsSettings = (await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "analyticsSettings",
    ])) as AnalyticsSettings
    const analyticsConsent = (await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "analyticsConsentSettings",
    ])) as ConsentSettings
    const enableEmulators = (await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "enableEmulators",
    ])) as boolean
    const logUserDetails = (await getCachedConfigValue(globalConfig, ["global", "enableUserIDLogging"])) as boolean
    const logLevelDev = (await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "logLevel",
        "dev",
    ])) as LogLevel
    const logLevelProd = (await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "logLevel",
        "prod",
    ])) as LogLevel

    // Initialize Firebase Analytics

    const supported = await isSupported().catch((error) => {
        throw new Error("Error checking analytics support.", { cause: error })
    })
    if (mode === "production" && enableAnalytics && supported) initializeAnalytics(app, analyticsSettings || {})
    if (analyticsConsent) setConsent(analyticsConsent)

    // Initialize Firebase Services

    const authPersistence = (await getCachedConfigValue(globalConfig, [
        "global",
        "auth",
        "authPersistenceType",
    ])) as string
    const persistence: Persistence[] =
        authPersistence === "LOCAL"
            ? [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence]
            : authPersistence === "SESSION"
              ? [browserSessionPersistence, inMemoryPersistence]
              : [inMemoryPersistence]

    const authSettings = {
        popupRedirectResolver: undefined,
        persistence: persistence,
    }

    authInstances.main = initializeAuth(app, authSettings)
    for (const appName of appNames) {
        // eslint-disable-next-line security/detect-object-injection
        authInstances[appName as keyof AuthInstances] = initializeAuth(
            apps[`${appName}App` as keyof Apps],
            authSettings,
        )
    }
    const { main } = authInstances

    beforeAuthStateChanged(main, async (currentUser) => {
        if (currentUser) {
            const preLoginValue = await tryPromise(globalConfig.preLogin, [currentUser])
            if (preLoginValue === false) {
                throw new Error("Operation cancelled by preLogin")
            }
        }
    })

    // Initialize Firebase Emulators

    const disableIndividualEmulators = await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "disableIndividualEmulators",
    ])
    if (mode === "development" && enableEmulators) {
        if (!disableIndividualEmulators?.includes("Auth")) {
            const authPort = env.STOKER_FB_EMULATOR_AUTH_PORT ? parseInt(env.STOKER_FB_EMULATOR_AUTH_PORT) : 9099
            for (const authInstance of Object.values(authInstances)) {
                connectAuthEmulator(authInstance, `http://localhost:${authPort}`)
            }
        }
        if (!disableIndividualEmulators?.includes("Database")) {
            const databasePort = env.STOKER_FB_EMULATOR_DATABASE_PORT
                ? parseInt(env.STOKER_FB_EMULATOR_DATABASE_PORT)
                : 9000
            connectDatabaseEmulator(getDatabase(), "localhost", databasePort)
        }
        if (!disableIndividualEmulators?.includes("Firestore")) {
            const firestorePort = env.STOKER_FB_EMULATOR_FIRESTORE_PORT
                ? parseInt(env.STOKER_FB_EMULATOR_FIRESTORE_PORT)
                : 8080
            connectFirestoreEmulator(firestoreInstances.maintenance, "localhost", firestorePort)
        }
        if (!disableIndividualEmulators?.includes("Storage")) {
            const storagePort = env.STOKER_FB_EMULATOR_STORAGE_PORT
                ? parseInt(env.STOKER_FB_EMULATOR_STORAGE_PORT)
                : 9199
            connectStorageEmulator(getStorage(), "localhost", storagePort)
        }
        if (!disableIndividualEmulators?.includes("Functions")) {
            const functionsPort = env.STOKER_FB_EMULATOR_FUNCTIONS_PORT
                ? parseInt(env.STOKER_FB_EMULATOR_FUNCTIONS_PORT)
                : 5001
            connectFunctionsEmulator(getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION), "localhost", functionsPort)
        }
    }

    // Initilalize Maintenance and Version Listeners

    initializeVersionListener()
    initializeMaintenanceListener()

    // Initialize Connection Status

    initializeConnectionStatus()

    // Initialize Firebase Logging

    if (mode === "development") {
        if (logLevelDev) setLogLevel(logLevelDev)
        else setLogLevel("debug")
    }
    if (mode === "production") {
        if (logLevelProd) setLogLevel(logLevelProd)
        else setLogLevel("error")
    }
    if (logUserDetails) {
        const unsubscribeLog = onAuthStateChanged(main, async (user) => {
            if (user) {
                const webAppConfig = JSON.parse(env.STOKER_FB_WEB_APP_CONFIG)
                const log = () => {
                    console.log(`Tenant - ${webAppConfig.projectId} - User - ${user.uid}`)
                }
                onLog(log)
            }
        })
        unsubscribes.push(unsubscribeLog)
    }

    // Authenticate Firebase User

    await Promise.all(
        Object.values(authInstances).map((authInstance) =>
            authInstance.authStateReady().catch((error: unknown) => {
                throw new Error(`Error waiting for auth state in ${authInstance.app.name}.`, { cause: error })
            }),
        ),
    )

    let loginRequired = false
    for (const authInstance of Object.values(authInstances)) {
        if (!authInstance.currentUser) loginRequired = true
    }

    let offlinePersistence: "ALL" | "WRITE" | "NONE"

    onAuthStateChanged(main, async (currentUser) => {
        if (currentUser) {
            user = currentUser
            const idTokenResult = await getIdTokenResult(user)
            const { claims } = idTokenResult
            tenant = claims.tenant as string
            userData = {
                ...user,
                token: {
                    claims,
                },
            }
            const allAuthStates = []
            for (const authInstance of Object.values(authInstances)) {
                allAuthStates.push(
                    new Promise((resolve) => {
                        const unsubscribe = onAuthStateChanged(authInstance, async (currentUserInstance) => {
                            if (currentUserInstance) {
                                unsubscribe()
                                resolve({})
                            }
                        })
                    }),
                )
            }
            await Promise.all(allAuthStates)

            if (!errorEventsInitialized) {
                initializeErrorEvents(globalConfig)
                errorEventsInitialized = true
            }

            offlinePersistence = (await getCachedConfigValue(
                globalConfig,
                ["global", "auth", "offlinePersistenceType"],
                [user, claims],
            )) as "ALL" | "WRITE" | "NONE"
            const tabManager = (await getCachedConfigValue(
                globalConfig,
                ["global", "auth", "tabManager"],
                [user, claims],
            )) as "SINGLE" | "MULTI"
            const garbageCollectionStrategy = (await getCachedConfigValue(
                globalConfig,
                ["global", "auth", "garbageCollectionStrategy"],
                [user, claims],
            )) as "LRU" | "EAGER"
            const maxCacheSize =
                ((await getCachedConfigValue(
                    globalConfig,
                    ["global", "auth", "maxCacheSize"],
                    [user, claims],
                )) as number) || -1
            const maxWriteCacheSize = (await getCachedConfigValue(
                globalConfig,
                ["global", "auth", "maxWriteCacheSize"],
                [user, claims],
            )) as number
            let cacheSettings: { localCache: PersistentLocalCache } | { localCache: MemoryLocalCache }
            const persistentCache = {
                localCache: persistentLocalCache({
                    tabManager:
                        tabManager === "SINGLE"
                            ? persistentSingleTabManager({ forceOwnership: false })
                            : persistentMultipleTabManager(),
                    cacheSizeBytes: maxCacheSize,
                }),
            }
            const persistentWriteCache = {
                localCache: persistentLocalCache({
                    tabManager:
                        tabManager === "SINGLE"
                            ? persistentSingleTabManager({ forceOwnership: false })
                            : persistentMultipleTabManager(),
                    cacheSizeBytes: maxWriteCacheSize || maxCacheSize,
                }),
            }
            let garbageCollector: MemoryLruGarbageCollector | MemoryEagerGarbageCollector
            if (garbageCollectionStrategy === "EAGER") garbageCollector = memoryEagerGarbageCollector()
            else garbageCollector = memoryLruGarbageCollector({ cacheSizeBytes: maxCacheSize })
            if (offlinePersistence === "ALL") {
                cacheSettings = persistentCache
            } else {
                cacheSettings = {
                    localCache: memoryLocalCache({
                        garbageCollector,
                    }),
                }
            }
            firestoreInstances.main = initializeFirestore(app, cacheSettings)
            if (["ALL", "WRITE"].includes(offlinePersistence)) {
                firestoreInstances.firestoreWrite = initializeFirestore(firestoreWriteApp, persistentWriteCache)
            } else {
                firestoreInstances.firestoreWrite = initializeFirestore(firestoreWriteApp, cacheSettings)
            }
            if (mode === "development" && enableEmulators) {
                if (!disableIndividualEmulators?.includes("Firestore")) {
                    const firestorePort = env.STOKER_FB_EMULATOR_FIRESTORE_PORT
                        ? parseInt(env.STOKER_FB_EMULATOR_FIRESTORE_PORT)
                        : 8080
                    for (const [firestoreInstanceName, firestoreInstance] of Object.entries(firestoreInstances)) {
                        if (firestoreInstanceName !== "maintenance") {
                            connectFirestoreEmulator(firestoreInstance, "localhost", firestorePort)
                        }
                    }
                }
            }
            if (offlinePersistence === "ALL") {
                const indexManager = getPersistentCacheIndexManager(firestoreInstances.main)
                if (indexManager) enablePersistentCacheIndexAutoCreation(indexManager)
            }

            const schemaApi = httpsCallable(getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION), "stoker-schema")
            const schemaResult = (await schemaApi().catch((error) => {
                throw new Error("Error fetching schema.", { cause: error })
            })) as {
                data: {
                    schema: CollectionsSchema
                    allRoleGroups: Record<StokerCollection, RoleGroup[]>
                    currentUserRoleGroups: Record<StokerCollection, RoleGroup>
                }
            }
            schema = schemaResult.data.schema as CollectionsSchema
            const deserializedAllRoleGroups = Object.entries(schemaResult.data.allRoleGroups).map(
                ([collectionName, roleGroups]) => {
                    return [collectionName, new Set(roleGroups)]
                },
            )
            allRoleGroups = Object.fromEntries(deserializedAllRoleGroups) as Record<StokerCollection, Set<RoleGroup>>
            currentUserRoleGroups = schemaResult.data.currentUserRoleGroups as Record<StokerCollection, RoleGroup>

            customizationModules = getCustomization(
                Object.keys(schema.collections),
                collectionFiles,
                "web",
                utilities,
                context,
            )

            const userListeners = await initializeUserListeners(user, idTokenResult)
            unsubscribes.push(...userListeners)

            if (offlinePersistence === "WRITE") {
                retryPendingWrites(schema, user)
            }

            await tryPromise(globalConfig.postLogin, [user])

            const event = new Event("stoker:ready")
            document.dispatchEvent(event)
        } else if (user) {
            clearStokerState()

            const unsubscribes = getUnsubscribes()
            unsubscribes.forEach((unsubscribe) => {
                unsubscribe()
            })
            clearUnsubscribes()

            const event = new Event("stoker:signOut")
            document.dispatchEvent(event)

            const signOutError: {
                error: boolean
                instances: {
                    instance: "[DEFAULT]" | "firestoreWrite"
                    code: "SIGN_OUT" | "TERMINATE_APP" | "CLEAR_CACHE"
                    error: unknown
                }[]
            } = { error: false, instances: [] }
            await Promise.all(
                Object.values(authInstances).map(async (authInstance) => {
                    if (authInstance.currentUser) {
                        await signOut(authInstance).catch((error) => {
                            signOutError.error = true
                            signOutError.instances.push({
                                instance: authInstance.app.name,
                                code: "SIGN_OUT",
                                error: error,
                            })
                            console.error(`Error signing out of ${authInstance.app.name}.`)
                        })
                    }
                }),
            )

            await Promise.all(
                Object.entries(firestoreInstances).map(async ([firestoreInstanceName, firestoreInstance]) => {
                    if (firestoreInstanceName === "maintenance") return
                    if (Object.keys(firestoreInstance).length !== 0) {
                        await terminate(firestoreInstance).catch((error) => {
                            console.error(`Error terminating ${firestoreInstance.app.name}.`)
                            signOutError.error = true
                            signOutError.instances.push({
                                instance: firestoreInstance.app.name,
                                code: "TERMINATE_APP",
                                error: error,
                            })
                        })
                    }
                }),
            )

            const clearPersistenceOnSignOut =
                ((await getCachedConfigValue(globalConfig, [
                    "global",
                    "auth",
                    "clearPersistenceOnSignOut",
                ])) as boolean) ?? true

            if (clearPersistenceOnSignOut) {
                if (offlinePersistence === "ALL") {
                    await clearIndexedDbPersistence(firestoreInstances.main).catch((error) => {
                        console.error(`Error clearing indexedDB persistence in "[DEFAULT]".`)
                        signOutError.error = true
                        signOutError.instances.push({ instance: "[DEFAULT]", code: "CLEAR_CACHE", error: error })
                    })
                }
                if (["ALL", "WRITE"].includes(offlinePersistence)) {
                    await clearIndexedDbPersistence(firestoreInstances.firestoreWrite).catch((error) => {
                        console.error(`Error clearing indexedDB persistence in "firestoreWrite".`)
                        signOutError.error = true
                        signOutError.instances.push({ instance: "firestoreWrite", code: "CLEAR_CACHE", error: error })
                    })
                }
            }

            /*

            await deleteApp(app).catch((error) => {
                console.error("Error deleting main app.")
                signOutError.error = true
                signOutError.instances.push({ instance: "[DEFAULT]", code: "DELETE_APP", error: error })
            })
            await Promise.all(
                appNames.map(async (appName) => {
                    await deleteApp(apps[`${appName}App`]).catch((error) => {
                        console.error(`Error deleting ${appName} app.`)
                        signOutError.error = true
                        signOutError.instances.push({ instance: appName, code: "DELETE_APP", error: error })
                    })
                }),
            )

            */

            signOutError.error
                ? console.info(`Sign out operation completed with errors.`)
                : console.info(`Sign out operation completed successfully.`)

            await tryPromise(globalConfig.postLogout, [signOutError])
        }
    })

    if (loginRequired) {
        return false
    } else if (main.currentUser) {
        if (logUserDetails) console.info(`${main.currentUser.uid} successfully logged in.`)
        return true
    }

    return false
}

export const {
    getTenant,
    getEnv,
    getTimezone,
    getSchema,
    getCurrentUser,
    getCurrentUserRoleGroups,
    getAllRoleGroups,
    getGlobalConfigModule,
    getCollectionConfigModule,
    getAppCheck,
    getAppCheckFirestoreWrite,
    getFirestoreWriteAuth,
    getFirestoreWrite,
    getFirestoreMaintenance,
} = utilities

export {
    getConnectionStatus,
    getNetworkStatus,
    getVersionInfo,
    getMaintenanceInfo,
    getCurrentUserPermissions,
    getLoadingState,
    getUnsubscribes,
    clearUnsubscribes,
}

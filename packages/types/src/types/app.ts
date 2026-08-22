import type {
    CollectionAdminCache,
    CollectionCustomCache,
    CollectionCustomization,
    CollectionsSchema,
    PostFileAddErrorHook,
    PostFileAddHook,
    PostFileUpdateHook,
    PostOperationHook,
    PostReadHook,
    PostWriteErrorHook,
    PostWriteHook,
    PreDuplicateHook,
    PreFileAddHook,
    PreFileUpdateHook,
    PreOperationHook,
    PreReadHook,
    PreValidateHook,
    PreWriteHook,
    RoleGroup,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
    StokerRole,
} from "./schema"

import type { Auth, ParsedToken, User } from "firebase/auth"
import type { Firestore, Timestamp, WhereFilterOp } from "firebase/firestore"
import type { AnalyticsSettings, ConsentSettings } from "firebase/analytics"
import type { AppCheck } from "firebase/app-check"

import type { FieldValue, Firestore as AdminFirestore } from "firebase-admin/firestore"
import { FirebaseError } from "firebase-admin"

/** Auth config for the app */
export interface AuthConfig {
    /** An array of roles. App users with these roles will have the option to enable multi factor auth (using an Authenticator app) */
    enableMultiFactorAuth: boolean | StokerRole[]
    /**
     * The auth persistence strategy for your app.
     * "LOCAL": Auth state is persisted across sessions. The user will stay logged in even when the window is closed or refreshed.
     * "SESSION": Auth state is persisted within the same session. The user will be logged out when the window is closed.
     * "NONE": Auth state is not persisted. The user will be logged out when the window is closed or refreshed
     */
    authPersistenceType:
        "LOCAL" | "SESSION" | "NONE" | (() => "LOCAL" | "SESSION" | "NONE" | Promise<"LOCAL" | "SESSION" | "NONE">)
    /**
     * Set to `true` to sign out a user when their permissions are changed. If falsy, the Admin UI
     * will attempt to reload data affected by the permissions change
     */
    signOutOnPermissionsChange?: boolean
    /**
     * Only relevant if `offlinePersistenceType` is set to "ALL" or "WRITE".
     * Set to `true` to clear offline persistence data from IndexedDB on sign out.
     * Warning: the Firebase team does not recommend relying on this method for security purposes
     */
    clearPersistenceOnSignOut?: boolean
    /**
     * The offline persistence strategy for your app.
     * "ALL": All data read and written is stored in IndexedDB and persisted across sessions. Offline writes will be retried when the connection is restored, even if the window is closed while still offline. Warning: creates a security risk on public computers.
     * "WRITE": Writes are persisted across sessions. `enableWriteLog` must be set to `true` for offline persistent writes to work for a collection.
     * "NONE": No offline persistence. Offline writes will fail if the window is closed before the connection is restored
     */
    offlinePersistenceType:
        | "ALL"
        | "WRITE"
        | "NONE"
        | ((user: User, claims: ParsedToken) => "ALL" | "WRITE" | "NONE" | Promise<"ALL" | "WRITE" | "NONE">)
    /**
     * Only relevant if `offlinePersistenceType` is set to "ALL" or "WRITE".
     * Whether to use offline persisted data across tabs. If set to "SINGLE", offline persistence
     * will only be available in the first tab opened. Defaults to "MULTI"
     */
    tabManager?: "SINGLE" | "MULTI"
    /**
     * Only relevant if `offlinePersistenceType` is set to "WRITE" or "NONE".
     * The garbage collection strategy to use for in-memory data. We highly recommend using "LRU".
     * Defaults to "LRU"
     */
    garbageCollectionStrategy?: "LRU" | "EAGER"
    /**
     * The maximum cache size for in-memory ("LRU" only) and persisted ("ALL" or "WRITE" only) caches.
     * Use `-1` to set an unlimited cache size. Defaults to `-1`
     */
    maxCacheSize?: number
    /** Overwrites `maxCacheSize` for the write database instance only. Use `-1` to set an unlimited cache size. Defaults to `-1` */
    maxWriteCacheSize?: number
}

/** Firebase config for the app */
export interface FirebaseConfig {
    /** Enable or disable the Firebase Emulators. */
    enableEmulators?: boolean | (() => boolean | Promise<boolean>)
    /** Disable individual Firebase Emulators */
    disableIndividualEmulators?: ("Auth" | "Database" | "Firestore" | "Storage" | "Functions")[]
    /** The settable config flag for GDPR opt-in/opt-out */
    GDPRSettings?: boolean | (() => boolean | Promise<boolean>)
    /** Enable or disable Google Analytics for your app */
    enableAnalytics?: boolean | (() => boolean | Promise<boolean>)
    /** Google Analytics config */
    analyticsSettings?: AnalyticsSettings | (() => AnalyticsSettings | Promise<AnalyticsSettings>)
    /** Google Analytics consent config */
    analyticsConsentSettings?: ConsentSettings | (() => ConsentSettings | Promise<ConsentSettings>)
    /** The Firebase log levels for development and production mode */
    logLevel?: {
        /** The Firebase log level for development mode */
        dev?: "debug" | "verbose" | "info" | "warn" | "error" | "silent"
        /** The Firebase log level for production mode */
        prod?: "debug" | "verbose" | "info" | "warn" | "error" | "silent"
    }
    /**
     * Exempt the user permissions collection from Firestore indexing. We recommend setting this to
     * `true` for performance reasons, however you will need to set it to falsy in order to query
     * the permissions collection by specific fields
     */
    permissionsIndexExemption?: boolean
    /** Exempt individual fields from the write log. We recommend leaving this as an empty array unless you have a good reason to exempt fields */
    writeLogIndexExemption?: string[]
    /**
     * If set, this is the number of days after which write log entries will be deleted.
     * We recommend leaving it out in order to keep records of write activity indefinitely
     */
    writeLogTTL?: number
    /** The strategy to use for Firestore server timestamps. We recommend setting this to "estimate". Defaults to "none" */
    serverTimestampOptions?:
        | "none"
        | "estimate"
        | "previous"
        | (() => "none" | "estimate" | "previous" | Promise<"none" | "estimate" | "previous">)
}

/** Preload cache config, defining the order in which collections are preloaded on app startup */
export interface PreloadConfig {
    /**
     * An array of collection names that have the preload cache enabled. These collections will be
     * preloaded synchronously while the async collections also load. Collections not listed in
     * `async` or `sync` will load synchronously after the collections in this list
     */
    sync?: StokerCollection[] | (() => StokerCollection[] | Promise<StokerCollection[]>)
    /** An array of collection names that have the preload cache enabled. These collections will be preloaded first, in parallel */
    async?: StokerCollection[] | (() => StokerCollection[] | Promise<StokerCollection[]>)
}

/** Mail config for the app */
export interface MailConfig {
    /**
     * Customize the email address verification email sent out to your app's users.
     * Receives the verification link and app name, and returns the subject and html message to send
     */
    emailVerification?: (
        verificationLink: string,
        appName?: string,
    ) => {
        subject: string
        html: string
    }
}

/** A menu group defining the menu structure for the user roles in your system */
export interface MenuGroup {
    /** The title for the menu group */
    title: string
    /** The position of the group in the menu */
    position: number
    /** The collections in the menu group */
    collections: StokerCollection[]
    /** The roles that can see this menu group */
    roles?: StokerRole[]
}

/** A meta tag icon for the app's home page, i.e. `<link rel="icon" type="image/png" href="./favicon.ico" />` */
export interface MetaIcon {
    rel: string
    type: string
    url: string
}

/** Display a metric (numerical counter) on the Dashboard */
export interface DashboardMetric {
    kind: "metric"
    /** The collection to aggregate */
    collection: StokerCollection
    /** The metric type */
    type: "sum" | "average" | "count"
    /** The field to aggregate. Not required for `count` */
    field?: string
    /** Limit which user roles can view the metric */
    roles?: StokerRole[]
    /** The title shown above the metric */
    title?: string
    /** Maximum decimal places to display */
    decimal?: number
    /** Prefix text, for example a currency symbol */
    prefix?: string
    /** Suffix text, for example units */
    suffix?: string
    /** Tailwind text size for the metric value */
    textSize?: "text-xl" | "text-2xl" | "text-3xl"
    /** Firestore constraints to apply to the metric query */
    constraints?: [string, WhereFilterOp, unknown][]
    /** Force metric data to be loaded from the server */
    forceServer?: boolean
}
/** Display a chart on the Dashboard */
export interface DashboardChart {
    kind: "chart"
    /** The collection to chart */
    collection: StokerCollection
    /** The chart type */
    type: "area"
    /** The date field used to group points */
    dateField: string
    /** First metric field */
    metricField1?: string
    /** Optional second metric field */
    metricField2?: string
    /** Custom calculation for the first metric */
    formula1?: (record: StokerRecord) => number
    /** Custom calculation for the second metric */
    formula2?: (record: StokerRecord) => number
    /** The label for the first metric */
    label1?: string | (() => string)
    /** The label for the second metric */
    label2?: string | (() => string)
    /** Show or hide the y-axis */
    yAxis?: { show?: boolean | (() => boolean) }
    /** Limit which user roles can view the chart */
    roles?: StokerRole[]
    /** Title shown above the chart */
    title?: string
    /** Firestore constraints to apply to the chart query */
    constraints?: [string, WhereFilterOp, unknown][]
    /** The interval to group points by */
    interval?: "day" | "month" | "year"
    /** The number of intervals to display */
    numberOfIntervals?: number
    /** Offset the intervals by this amount */
    offset?: number
    /** Animate the chart */
    animate?: boolean
    /** Currency symbol to display */
    currency?: string | (() => string)
}

/** Display a reminder (a list of pertinent records) on the Dashboard */
export interface DashboardReminder {
    kind: "reminder"
    /** The collection to show records from */
    collection: StokerCollection
    /** Which columns to show in the list */
    columns: string[]
    /** The title shown above the reminder */
    title?: string
    /** Limit which user roles can view the reminder */
    roles?: StokerRole[]
    /** Firestore constraints to apply to the reminder query */
    constraints?: [string, WhereFilterOp, unknown][]
    /** The field and direction to sort records by */
    sort?: {
        field: string
        direction: "asc" | "desc"
    }
    /** Force the reminder records to be loaded from the server */
    forceServer?: boolean
    /** Filter which records are displayed */
    filter?: (record: StokerRecord) => boolean
}

/** An item shown on the Dashboard. Items will be laid out in a grid */
export type DashboardItem = DashboardMetric | DashboardChart | DashboardReminder

/** Background properties of the `body` for light and dark mode */
export interface Background {
    light?: {
        color: string
        image?: string
    }
    dark?: {
        color: string
        image?: string
    }
}

/** Admin UI config for the app */
export interface AdminConfig {
    /**
     * If defined, only the roles listed will be able to see the Admin UI. Warning: this access
     * restriction is only enforced on the client. Users can still log in, but they won't see anything
     */
    access?: StokerRole[] | (() => StokerRole[])
    /** Background objects for light and dark mode. This lets you control the background properties of the `body` */
    background?: Background | (() => Background)
    /** Image urls to be used for the navbar title and the login page. If not provided, the icons in your `icons` directory will be used */
    logo?: {
        navbar?: string
        login?: string
    }
    /** The menu structures for the user roles in your system */
    menu?: {
        groups?: MenuGroup[]
    }
    /** The Luxon date format to display dates in */
    dateFormat?: string | (() => string)
    /** The meta tag description and icons for your app's home page */
    meta?: {
        description?: string
        icons?: MetaIcon[]
    }
    /** Items shown on the Dashboard, laid out in a grid. We recommend that each row contains 1-2 metrics and a chart, 1 reminder and a chart, or 3 reminders */
    dashboard?: DashboardItem[]
    /**
     * Key/value pairs defining user roles and the collection that will act as their homepage.
     * If the user role has access to the Dashboard, that will take precedence
     */
    homePage?: Record<StokerRole, StokerCollection> | (() => Record<StokerRole, StokerCollection>)
    searchAll?: boolean | (() => boolean)
}

export interface GenerateGlobalConfigParams {
    sdk: "web" | "node"
    utils?: WebUtilities | NodeUtilities
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any
}

export type GenerateGlobalConfig = (params: GenerateGlobalConfigParams) => GlobalConfig

export type Region =
    | "asia-east1"
    | "asia-east2"
    | "asia-northeast1"
    | "asia-northeast2"
    | "asia-northeast3"
    | "asia-south1"
    | "asia-southeast1"
    | "asia-southeast2"
    | "australia-southeast1"
    | "australia-southeast2"
    | "europe-central2"
    | "europe-north1"
    | "europe-west1"
    | "europe-west2"
    | "europe-west3"
    | "europe-west6"
    | "northamerica-northeast1"
    | "northamerica-northeast2"
    | "southamerica-east1"
    | "southamerica-west1"
    | "us-central1"
    | "us-east1"
    | "us-east4"
    | "us-west1"
    | "us-west2"
    | "us-west3"
    | "us-west4"

/** Project-wide config for your app, defined in the global config file at src/main.ts */
export type GlobalConfig = {
    /**
     * This is the big one. Name the access roles that will be used in your app.
     * Each role will have its own permissions, i.e. `["Manager", "Supervisor", "Staff Member", "Client"]`
     */
    roles: StokerRole[]
    /** An array of collection names that will be disabled in your app (on the next `stoker deploy`) */
    disabledCollections?: StokerCollection[]
    /** The name of your app. Shorter is better, as this will be used for page titles etc */
    appName: string | (() => string | Promise<string>)
    /** Your app will be based in this timezone. Must be a valid IANA timezone */
    timezone?: string | (() => string | Promise<string>)
    /** Auth config for the app */
    auth: AuthConfig
    /** Firebase config for the app */
    firebase?: FirebaseConfig
    /** Preload cache config, defining the order in which collections are preloaded on app startup */
    preload?: PreloadConfig
    /**
     * Whether to log the user's ID in the client whenever Firebase prints logs. This can be useful
     * for debugging, but may cause privacy concerns in some scenarios. Disabled by default
     */
    enableUserIDLogging?: boolean | (() => boolean | Promise<boolean>)
    /** Mail config for the app */
    mail?: MailConfig
    /**
     * Fires before the user is logged in, prior to any other authentication logic being processed.
     * You may block the sign in by returning `false`. Warning: this logic is client-side and is
     * skippable. Use Firebase Auth Blocking Cloud Functions for secure sign-in-blocking operations
     */
    preLogin?: (user: User) => boolean | void | Promise<boolean | void>
    /** Fires after the user has successfully logged in */
    postLogin?: (user?: User, error?: unknown) => void | Promise<void>
    /** Fires when the user attempts to log out. You may block the sign out by returning `false` */
    preLogout?: (user: User) => boolean | void | Promise<boolean | void>
    /**
     * Fires when the user has logged out. If an error is encountered during sign out, additional
     * information is provided describing which Firestore instances encountered the error, the
     * operation that encountered the error, and the error itself
     */
    postLogout?: (errorDetails: {
        error: boolean
        instances: {
            instance: "[DEFAULT]" | "firestoreWrite"
            code: "SIGN_OUT" | "TERMINATE_APP" | "CLEAR_CACHE"
            error: unknown
        }[]
    }) => void | Promise<void>
    /**
     * Fires when the schema version is updated. Note: if `refresh` is `true` for the schema update,
     * the page will automatically refresh and this hook will not fire
     */
    onVersionUpdate?: (versionInfo: VersionInfo, numberOfUpdates: number) => void | Promise<void>
    /** Fires when maintenance mode is engaged / disengaged */
    onMaintenanceUpdate?: (status: "on" | "off") => void | Promise<void>
    /** Fires when the app goes online / offline. `first` will be true for the initial value read on app startup */
    onConnectionStatusChange?: (status: "Online" | "Offline", first: boolean) => void | Promise<void>
    /** Fires when Cloud Firestore detects a slow internet connection */
    onFirestoreSlowConnection?: () => void | Promise<void>
    /** Fires when Cloud Firestore experiences a read failure, usually due to excessive contention on documents or exceeded quotas */
    onFirestoreLoadFailure?: () => void | Promise<void>
    /** Fires in rare cases where Firestore IndexedDB persistence fails */
    onIndexedDBConnectionLost?: () => void | Promise<void>
    /** Fires when App Check token refresh fails */
    onAppCheckTokenFailure?: (error: FirebaseError) => void | Promise<void>
    /** Fires before all read and write operations. Return `false` to cancel the operation */
    preOperation?: PreOperationHook
    /** Fires before all read operations */
    preRead?: PreReadHook
    /** Fires after all read operations */
    postRead?: PostReadHook
    /** Fires before all duplicate operations in the Admin UI. Return `false` to cancel the operation */
    preDuplicate?: PreDuplicateHook
    /**
     * Fires at write validation time for all write operations. This is where you can define custom
     * validation logic. Return an object with a boolean indicating whether validation passed, and
     * a message to display to the user if validation has failed
     */
    preValidate?: PreValidateHook
    /** Fires before all write operations. Return `false` to cancel the operation */
    preWrite?: PreWriteHook
    /** Fires after all write operations */
    postWrite?: PostWriteHook
    /**
     * Fires when a write operation encounters an error. This hook may fire multiple times per write,
     * so be sure to write idempotent code
     */
    postWriteError?: PostWriteErrorHook
    /** Fires after all read and write operations */
    postOperation?: PostOperationHook
    /** Fires before a file is uploaded. Return `false` to cancel the operation */
    preFileAdd?: PreFileAddHook
    /** Fires before a file is updated. Return `false` to cancel the operation */
    preFileUpdate?: PreFileUpdateHook
    /** Fires after a file is uploaded */
    postFileAdd?: PostFileAddHook
    /** Fires when a file upload fails */
    postFileAddError?: PostFileAddErrorHook
    /** Fires after a file is updated */
    postFileUpdate?: PostFileUpdateHook
    /** Admin UI config for the app */
    admin?: AdminConfig
}

export interface ConfigCache {
    global?: GlobalConfigCache
    collections?: {
        [collection: string]: {
            custom?: CollectionCustomCache
            admin?: CollectionAdminCache
        }
    }
}

export interface GlobalConfigCache {
    roles?: StokerRole[]
    disabledCollections?: StokerCollection[]
    appName?: string
    timezone?: string
    auth?: {
        enableMultiFactorAuth?: boolean | StokerRole[]
        authPersistenceType?: "LOCAL" | "SESSION" | "NONE"
        signOutOnPermissionsChange?: boolean
        clearPersistenceOnSignOut?: boolean
        offlinePersistenceType?: "ALL" | "WRITE" | "NONE"
        tabManager?: "SINGLE" | "MULTI"
        garbageCollectionStrategy?: "LRU" | "EAGER"
        maxCacheSize?: number
        maxWriteCacheSize?: number
    }
    firebase?: {
        enableEmulators?: boolean
        disableIndividualEmulators?: ("Auth" | "Database" | "Firestore" | "Storage" | "Functions")[]
        GDPRSettings?: boolean
        enableAnalytics?: boolean
        analyticsSettings?: AnalyticsSettings
        analyticsConsentSettings?: ConsentSettings
        logLevel?: {
            dev?: "debug" | "verbose" | "info" | "warn" | "error" | "silent"
            prod?: "debug" | "verbose" | "info" | "warn" | "error" | "silent"
        }
        permissionsIndexExemption?: boolean
        writeLogIndexExemption?: string[]
        writeLogTTL?: number
        serverTimestampOptions?: "none" | "estimate" | "previous"
    }
    preload?: {
        sync?: StokerCollection[]
        async?: StokerCollection[]
    }
    enableUserIDLogging?: boolean
    admin?: {
        access?: StokerRole[]
        background?: Background
        logo?: {
            navbar?: string
            login?: string
        }
        menu?: {
            groups?: MenuGroup[]
        }
        dateFormat?: string
        meta?: {
            description?: string
            icons?: MetaIcon[]
        }
        dashboard?: DashboardItem[]
        homePage?: Record<StokerRole, StokerCollection>
        searchAll?: boolean
    }
}

export interface VersionInfo {
    version: number
    force: boolean
    refresh: boolean
    time: Timestamp | FieldValue
    payload: unknown
}

export interface WebUtilities {
    getTenant: () => string
    getEnv: () => Record<string, string>
    getTimezone: () => string
    getConnectionStatus: () => "Online" | "Offline"
    getNetworkStatus: () => "Online" | "Offline"
    getSchema: (includeComputedFields?: boolean) => CollectionsSchema
    getCurrentUser: () => User & { token: { claims: ParsedToken } }
    getCurrentUserRoleGroups: () => Record<StokerCollection, RoleGroup>
    getAllRoleGroups: () => Record<StokerCollection, Set<RoleGroup>>
    getGlobalConfigModule: () => GlobalConfig
    getCollectionConfigModule: (collection: string) => CollectionCustomization
    getVersionInfo: () => VersionInfo | undefined
    getMaintenanceInfo: () => { active: boolean } | undefined
    getCurrentUserPermissions: () => StokerPermissions | null
    getLoadingState: () => { [collection: string]: "Loading" | "Loaded" | "Error" }

    getAppCheck: () => AppCheck
    getAppCheckFirestoreWrite: () => AppCheck
    getFirestoreWriteAuth: () => Auth
    getStokerFirestore: () => Firestore
    getFirestoreWrite: () => Firestore
    getFirestoreMaintenance: () => Firestore
}

export interface NodeUtilities {
    getMode: () => "development" | "production"
    getTenant: () => string
    setTenant: (tenantId: string) => void
    getTimezone: () => string
    getGlobalConfigModule: () => GlobalConfig
    getCustomizationFile: (collection: string, schema: CollectionsSchema) => CollectionCustomization
    getVersionInfo: () => VersionInfo | undefined
    getMaintenanceInfo: () => { active: boolean } | undefined
    getStokerFirestore: () => AdminFirestore
}

export interface StokerState {
    [key: `collection-tab-${StokerCollection}`]: string
    [key: `collection-search-${StokerCollection}`]: string
    [key: `collection-status-filter-${StokerCollection}`]: string
    [key: `collection-page-number-${StokerCollection}`]: string
    [key: `collection-start-after-${StokerCollection}`]: string
    [key: `collection-end-before-${StokerCollection}`]: string
    [key: `collection-sort-${StokerCollection}`]: string
    [key: `collection-calendar-large-${StokerCollection}`]: string
    [key: `collection-calendar-small-${StokerCollection}`]: string
    [key: `collection-calendar-large-date-${StokerCollection}`]: string
    [key: `collection-calendar-small-date-${StokerCollection}`]: string
    [key: `collection-filters-${StokerCollection}`]: string
    [key: `collection-range-${StokerCollection}`]: string
    [key: `collection-range-field-${StokerCollection}`]: string
    [key: `collection-range-selector-${StokerCollection}`]: string
}

export interface DialogContent {
    title: string
    description: string
    disableClose?: boolean
    buttons?: {
        label: string
        onClick: () => void | Promise<void>
    }[]
}

export interface UserData {
    permissions?: StokerPermissions
    operation?: "create" | "update" | "delete"
    password?: string
    passwordConfirm?: string
}

export interface StorageItem {
    name: string
    fullPath: string
    isFolder: boolean
    metadata?: {
        read?: string[]
        update?: string[]
        delete?: string[]
        createdBy?: string
    }
}

export interface UploadProgress {
    file: File
    progress: number
    status: "uploading" | "completed" | "error"
    completedAt?: number
}

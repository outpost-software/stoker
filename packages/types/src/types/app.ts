import type {
    CollectionAdminCache,
    CollectionCustomCache,
    CollectionCustomization,
    CollectionsSchema,
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
    StokerRole,
} from "./schema"

import type { Auth, ParsedToken, User } from "firebase/auth"
import type { Firestore, Timestamp, WhereFilterOp } from "firebase/firestore"
import type { AnalyticsSettings, ConsentSettings } from "firebase/analytics"
import type { AppCheck } from "firebase/app-check"

import type { FieldValue } from "firebase-admin/firestore"
import { FirebaseError } from "firebase-admin"

export interface AuthConfig {
    enableMultiFactorAuth: boolean | StokerRole[]
    authPersistenceType:
        | "LOCAL"
        | "SESSION"
        | "NONE"
        | (() => "LOCAL" | "SESSION" | "NONE" | Promise<"LOCAL" | "SESSION" | "NONE">)
    signOutOnPermissionsChange?: boolean
    clearPersistenceOnSignOut?: boolean
    offlinePersistenceType:
        | "ALL"
        | "WRITE"
        | "NONE"
        | ((user: User, claims: ParsedToken) => "ALL" | "WRITE" | "NONE" | Promise<"ALL" | "WRITE" | "NONE">)
    tabManager?: "SINGLE" | "MULTI"
    garbageCollectionStrategy?: "LRU" | "EAGER"
    maxCacheSize?: number
    maxWriteCacheSize?: number
}

export interface FirebaseConfig {
    enableEmulators?: boolean | (() => boolean | Promise<boolean>)
    disableIndividualEmulators?: ("Auth" | "Database" | "Firestore" | "Storage" | "Functions")[]
    GDPRSettings?: boolean | (() => boolean | Promise<boolean>)
    enableAnalytics?: boolean | (() => boolean | Promise<boolean>)
    analyticsSettings?: AnalyticsSettings | (() => AnalyticsSettings | Promise<AnalyticsSettings>)
    analyticsConsentSettings?: ConsentSettings | (() => ConsentSettings | Promise<ConsentSettings>)
    logLevel?: {
        dev?: "debug" | "verbose" | "info" | "warn" | "error" | "silent"
        prod?: "debug" | "verbose" | "info" | "warn" | "error" | "silent"
    }
    permissionsIndexExemption?: boolean
    writeLogIndexExemption?: string[]
    writeLogTTL?: number
    serverTimestampOptions?:
        | "none"
        | "estimate"
        | "previous"
        | (() => "none" | "estimate" | "previous" | Promise<"none" | "estimate" | "previous">)
}

export interface PreloadConfig {
    sync?: StokerCollection[] | (() => StokerCollection[] | Promise<StokerCollection[]>)
    async?: StokerCollection[] | (() => StokerCollection[] | Promise<StokerCollection[]>)
}

export interface MailConfig {
    emailVerification?: (
        verificationLink: string,
        appName?: string,
    ) => {
        subject: string
        html: string
    }
}

export interface MenuGroup {
    title: string
    position: number
    collections: StokerCollection[]
    roles?: StokerRole[]
}

export interface MetaIcon {
    rel: string
    type: string
    url: string
}

export interface DashboardMetric {
    kind: "metric"
    collection: StokerCollection
    type: "sum" | "average" | "count"
    field?: string
    roles?: StokerRole[]
    title?: string
    decimal?: number
    prefix?: string
    suffix?: string
    textSize?: "text-xl" | "text-2xl" | "text-3xl"
}
export interface DashboardChart {
    kind: "chart"
    collection: StokerCollection
    type: "area"
    dateField: string
    metricField1?: string
    metricField2?: string
    defaultRange: "90d" | "30d" | "7d"
    roles?: StokerRole[]
    title?: string
}

export interface DashboardReminder {
    kind: "reminder"
    collection: StokerCollection
    columns: string[]
    title?: string
    roles?: StokerRole[]
    constraints?: [string, WhereFilterOp, unknown][]
    sort?: {
        field: string
        direction: "asc" | "desc"
    }
}

export type DashboardItem = DashboardMetric | DashboardChart | DashboardReminder

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

export interface AdminConfig {
    access?: StokerRole[] | (() => StokerRole[])
    background?: Background | (() => Background)
    logo?: {
        navbar?: string
        login?: string
    }
    menu?: {
        groups?: MenuGroup[]
    }
    dateFormat?: string | (() => string)
    meta?: {
        description?: string
        icons?: MetaIcon[]
    }
    dashboard?: DashboardItem[]
    homePage?: Record<StokerRole, StokerCollection> | (() => Record<StokerRole, StokerCollection>)
}

export type GenerateGlobalConfig = (
    sdk: "web" | "node",
    config?: WebUtilities | NodeUtilities,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
) => GlobalConfig

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

export type GlobalConfig = {
    roles: StokerRole[]
    disabledCollections?: StokerCollection[]
    appName: string | (() => string | Promise<string>)
    timezone?: string | (() => string | Promise<string>)
    auth: AuthConfig
    firebase?: FirebaseConfig
    preload?: PreloadConfig
    enableUserIDLogging?: boolean | (() => boolean | Promise<boolean>)
    mail?: MailConfig
    preLogin?: (user: User) => boolean | void | Promise<boolean | void>
    postLogin?: (user?: User, error?: unknown) => void | Promise<void>
    preLogout?: (user: User) => boolean | void | Promise<boolean | void>
    postLogout?: (errorDetails: {
        error: boolean
        instances: {
            instance: "[DEFAULT]" | "firestoreWrite"
            code: "SIGN_OUT" | "TERMINATE_APP" | "CLEAR_CACHE"
            error: unknown
        }[]
    }) => void | Promise<void>
    onVersionUpdate?: (versionInfo: VersionInfo, numberOfUpdates: number) => void | Promise<void>
    onMaintenanceUpdate?: (status: "on" | "off") => void | Promise<void>
    onConnectionStatusChange?: (status: "Online" | "Offline", first: boolean) => void | Promise<void>
    onFirestoreSlowConnection?: () => void | Promise<void>
    onFirestoreLoadFailure?: () => void | Promise<void>
    onIndexedDBConnectionLost?: () => void | Promise<void>
    onAppCheckTokenFailure?: (error: FirebaseError) => void | Promise<void>
    preOperation?: PreOperationHook
    preRead?: PreReadHook
    postRead?: PostReadHook
    preDuplicate?: PreDuplicateHook
    preValidate?: PreValidateHook
    preWrite?: PreWriteHook
    postWrite?: PostWriteHook
    postWriteError?: PostWriteErrorHook
    postOperation?: PostOperationHook
    preFileAdd?: PreFileAddHook
    preFileUpdate?: PreFileUpdateHook
    postFileAdd?: PostFileAddHook
    postFileUpdate?: PostFileUpdateHook
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
        autoRefreshAppCheckToken?: boolean
        authPersistenceType?: "LOCAL" | "SESSION" | "NONE"
        offlinePersistenceType?: "ALL" | "WRITE" | "NONE"
        tabManager?: "SINGLE" | "MULTI"
        garbageCollectionStrategy?: "LRU" | "EAGER"
        maxCacheSize?: number
        maxWriteCacheSize?: number
    }
    firebase?: {
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
        logo?: {
            small?: string
            large?: string
        }
        menu?: {
            groups?: string[]
        }
        dateFormat?: string
        meta?: {
            icons?: MetaIcon[]
        }
        dashboard?: DashboardItem[]
        homePage?: Record<StokerRole, StokerCollection>
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

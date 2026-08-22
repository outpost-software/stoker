import { Timestamp as AdminTimestamp, FieldValue } from "firebase-admin/firestore"
import { Timestamp, WhereFilterOp, WriteBatch } from "firebase/firestore"
import { NodeUtilities, WebUtilities } from "./app"
import { CalendarOptions } from "@fullcalendar/core"
import { SearchOptions } from "minisearch"
import { UserRecord } from "firebase-admin/auth"

/** An access role in the app, i.e. "Manager". Each role has its own permissions */
export type StokerRole = string
/** The name of a collection in the app, i.e. "Clients" */
export type StokerCollection = string

export type FirestoreTimestamp = Timestamp | AdminTimestamp
export type InputTimestamp = Timestamp | FieldValue

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A relation value stored on a record, containing the related record's collection path and any denormalized include fields */
export interface StokerRelation {
    Collection_Path: string[]
    [key: string]: any
}

/** A map of related record IDs to relation values, as stored on relation fields */
export interface StokerRelationObject {
    [id: string]: StokerRelation
}
/** An array of related record IDs, as stored on relation fields */
export type StokerRelationArray = string[]

/** System fields automatically maintained on every record */
export interface SystemFields {
    /** The Firestore path segments for the record's collection */
    Collection_Path: string[]
    /** When the record was last written. Set on the client, so it may not be reliable. Useful for logging when offline writes occurred */
    Last_Write_At: Timestamp | FieldValue
    /** When the record was last saved. Safely generated on the server */
    Last_Save_At: Timestamp | FieldValue
    /** The ID of the user who last wrote the record */
    Last_Write_By: string
    /** The app that made the last write */
    Last_Write_App: string
    /** Whether the last write was made while online or offline */
    Last_Write_Connection_Status: "Online" | "Offline"
    /** The schema version at the time of the last write */
    Last_Write_Version: number
    /** When the record was created. Set on the client, so it may not be reliable. Useful for logging when offline writes occurred */
    Created_At: Timestamp | FieldValue
    /** When the record was first saved. Safely generated on the server */
    Saved_At: Timestamp | FieldValue
    /** The ID of the user who created the record */
    Created_By: string
}

/** A record in a Stoker collection, including system fields */
export interface StokerRecord extends SystemFields {
    [key: string]: any
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A user's permissions for a single collection, as stored in their permissions record */
export interface CollectionPermissions {
    /** Whether the user has been granted auth (credential assignment) access for this collection */
    auth?: boolean
    /** The CRUD operations the user can perform on the collection */
    operations: ("Read" | "Create" | "Update" | "Delete")[]
    /** Whether the Record Owner restriction is active for this user */
    recordOwner?: {
        active: boolean
    }
    /** Whether the Record User restriction is active for this user */
    recordUser?: {
        active: boolean
    }
    /** Whether the Record Property restriction is active for this user */
    recordProperty?: {
        active: boolean
    }
    /** Whether entity restrictions are active for this user */
    restrictEntities?: boolean
    /** IDs of individual records assigned to the user */
    individualEntities?: string[]
    /** IDs of parent records whose child records are assigned to the user */
    parentEntities?: string[]
    /** IDs of parent records mapped to the property values assigned to the user */
    parentPropertyEntities?: Record<string, string[]>
}

/** A user's permissions record, defining their role and per-collection access */
export interface StokerPermissions {
    /** The ID of the auth user these permissions apply to */
    User_ID?: string
    /** The ID of the record in the auth collection that the user is linked to */
    Doc_ID?: string
    /** The auth collection the user belongs to */
    Collection?: StokerCollection
    /** The user's access role */
    Role?: StokerRole
    /** Whether the user's access is enabled */
    Enabled?: boolean
    /** Per-collection permissions for the user */
    collections?: {
        [collection: string]: CollectionPermissions
    }
}

/** The names of the system fields automatically maintained on every record */
export type SystemField =
    | "id"
    | "Collection_Path"
    | "Last_Write_At"
    | "Last_Save_At"
    | "Last_Write_By"
    | "Last_Write_App"
    | "Last_Write_Connection_Status"
    | "Last_Write_Version"
    | "Created_At"
    | "Saved_At"
    | "Created_By"

/** The names for a collection. Names must start with a capital letter and contain only letters, digits, and underscores. Provide user-friendly labels in admin.titles */
export interface CollectionLabels {
    /** The name for the collection, i.e. "Clients" */
    collection: string
    /** The name for a record in the collection, i.e. "Client" */
    record: string
}

export type OperationType = "Read" | "Create" | "Update" | "Delete"
export type OperationTypeLower = "read" | "create" | "update" | "delete"

/** Defines which operations and restrictions can be assigned for a collection when writing permissions */
export interface PermissionWriteCollection {
    /** The collection these permission write restrictions apply to */
    collection: StokerCollection
    /** The operations that can be granted for the collection */
    operations: OperationType[]
    /** Attribute restrictions that must be applied when granting access to the collection */
    attributeRestrictions?: AttributeRestriction["type"][]
    /** Whether entity restrictions must be applied when granting access to the collection */
    restrictEntities?: boolean
    /** Whether auth access can be granted for the collection */
    auth?: boolean
}

/** Restricts which permissions a user role can assign to other user roles, allowing a flexible yet secure hierarchy of access assignment */
export interface PermissionWriteRestriction {
    /** The user role you are applying restrictions to */
    userRole: StokerRole
    /** A role that the user above can assign access to */
    recordRole: StokerRole
    /** Define which operations and restrictions are applied for each collection */
    collections: PermissionWriteCollection[]
}

/** A role that an attribute restriction applies to */
export interface AttributeRestrictionRole {
    /** The role that this restriction applies to */
    role: StokerRole
    /** If `true`, this restriction can be removed for individual users */
    assignable?: boolean
    /** For Record Property restrictions, the property values this role can access */
    values?: string[]
}
/** A role that an entity restriction applies to */
export interface EntityRestrictionRole {
    /** The role that this restriction applies to */
    role: StokerRole
}

export type AccessRole = AttributeRestrictionRole | EntityRestrictionRole

/** Assign individual records to a user in their profile */
export interface IndividualEntityRestriction {
    type: "Individual"
    /** The roles that this restriction applies to */
    roles: EntityRestrictionRole[]
    /** Advanced. Force read operations to get all records in a single API call */
    singleQuery?: number
}
/** Assign all records for a parent record to a user in their profile, i.e. "All Sites for Company X" */
export interface ParentEntityRestriction {
    type: "Parent"
    /** The roles that this restriction applies to */
    roles: EntityRestrictionRole[]
    /** The field that parent records can be selected from. Must be a relational field */
    collectionField: string
    /** Advanced. Force read operations to get all records in a single API call */
    singleQuery?: number
}
/** Assign all records for a parent record to a user in their profile, by attribute, i.e. "All Sites for Company X in State NY" */
export interface ParentPropertyEntityRestriction {
    type: "Parent_Property"
    /** The roles that this restriction applies to */
    roles: EntityRestrictionRole[]
    /** The field that parent records can be selected from. Must be a relational field */
    collectionField: string
    /** The field that defines the attribute */
    propertyField: string
}
export type AttributeRestriction = RecordUserRestriction | RecordOwnerRestriction | RecordPropertyRestriction

/** Users will only be able to access records that they have been assigned to, i.e. via an "Assigned To" field */
export interface RecordUserRestriction {
    type: "Record_User"
    /** The roles that this restriction applies to. If `assignable` is `true`, this restriction can be removed for individual users */
    roles: AttributeRestrictionRole[]
    /** The field used to assign access. Must be a relational field linked to an auth collection */
    collectionField: string
    /** If provided, the restriction only applies to the listed operations */
    operations?: ("Read" | "Create" | "Update" | "Delete")[]
}
/** Users will only be able to access records that they created themselves */
export interface RecordOwnerRestriction {
    type: "Record_Owner"
    /** The roles that this restriction applies to. If `assignable` is `true`, this restriction can be removed for individual users */
    roles: AttributeRestrictionRole[]
    /** If provided, the restriction only applies to the listed operations */
    operations?: ("Read" | "Create" | "Update" | "Delete")[]
}
/** Users will only be able to access records that have specified values for a selected field, i.e. only "Not Started" and "In Progress" records */
export interface RecordPropertyRestriction {
    type: "Record_Property"
    /** The roles this restriction applies to, and which property values they can access. If `assignable` is `true`, this restriction can be removed for individual users */
    roles: AttributeRestrictionRole[]
    /** The field that defines the property. Must be a String field with `values` set */
    propertyField: string
    /** If provided, the restriction only applies to the listed operations */
    operations?: ("Read" | "Create" | "Update" | "Delete")[]
}

export type EntityRestriction = IndividualEntityRestriction | ParentEntityRestriction | ParentPropertyEntityRestriction
export type AccessRestriction = AttributeRestriction | EntityRestriction

/** Apply an individual entity restriction from a parent collection onto this collection */
export interface IndividualEntityParentFilter {
    type: "Individual"
    /** The relational field that links to the collection that the individual entity restriction is on */
    collectionField: string
    /** The roles that this parent filter applies to */
    roles: EntityRestrictionRole[]
}
/** Apply a parent entity restriction from a parent collection onto this collection */
export interface ParentEntityParentFilter {
    type: "Parent"
    /** The relational field that links to the collection that the parent entity restriction is on */
    collectionField: string
    /** The relational field that matches the parent entity restriction's collection field */
    parentCollectionField: string
    /** The roles that this parent filter applies to */
    roles: EntityRestrictionRole[]
}
/** Apply a parent property entity restriction from a parent collection onto this collection */
export interface ParentPropertyEntityParentFilter {
    type: "Parent_Property"
    /** The relational field that links to the collection that the parent property entity restriction is on */
    collectionField: string
    /** The relational field that matches the parent entity restriction's collection field */
    parentCollectionField: string
    /** The field that matches the parent entity restriction's property field */
    parentPropertyField: string
    /** The roles that this parent filter applies to */
    roles: EntityRestrictionRole[]
}
export type EntityParentFilter =
    IndividualEntityParentFilter | ParentEntityParentFilter | ParentPropertyEntityParentFilter

/** Define which roles can perform which CRUD operations for the collection */
export interface AccessOperations {
    /** Set to `true` or an array of user roles to allow disabling of access in the user's profile */
    assignable?: boolean | StokerRole[]
    /** Roles that can read records in the collection */
    read?: StokerRole[]
    /** Roles that can create records in the collection */
    create?: StokerRole[]
    /** Roles that can update records in the collection */
    update?: StokerRole[]
    /** Roles that can delete records in the collection */
    delete?: StokerRole[]
}

/** The roles that must be granted each file operation */
export interface AccessFilesAssignmentRoles {
    /** Roles for read access to the file */
    read?: StokerRole[]
    /** Roles for update access to the file */
    update?: StokerRole[]
    /** Roles for delete access to the file */
    delete?: StokerRole[]
}
/** File access assignment rules for a user role */
export interface AccessFilesAssignment {
    /** Access assignments the user may optionally grant */
    optional?: AccessFilesAssignmentRoles
    /** Access assignments the user must grant */
    required?: AccessFilesAssignmentRoles
}
/** Access rules for file uploads */
export interface AccessFiles {
    /** Define the user roles that the user must assign access to for each file */
    assignment?: {
        [role: StokerRole]: AccessFilesAssignment
    }
    /** Enforce Firebase Storage metadata constraints, i.e. `{ size: " <= (5 * 1024 * 1024)" }` */
    metadata?: {
        [key: string]: string
    }
    /** Enforce custom metadata constraints */
    customMetadata?: {
        [key: string]: string
    }
}

/** Explicitly define which specific records or groups of records can be accessed by a user. Assignment is done in the user's profile (by an Admin) */
export interface EntityRestrictions {
    /** User roles for which entity restrictions can be disabled for individual users */
    assignable?: StokerRole[]
    /** The entity restrictions to apply */
    restrictions?: EntityRestriction[]
    /** Apply entity restrictions from a parent collection onto this collection, i.e. "All Jobs on Sites for Company X" */
    parentFilters?: EntityParentFilter[]
}
/** Access control config for the collection */
export interface CollectionAccess {
    /**
     * Roles that must read data via the server. This allows more granular access control (specified in
     * `custom.serverAccess` at the collection or field level). Warning: slows performance and removes
     * offline and realtime capabilities
     */
    serverReadOnly?: StokerRole[]
    /**
     * Set to `true` to force writes through the server. Required for two-way relation writes,
     * and automatically enabled for collections with `auth` set to `true`. Removes offline write
     * capabilities, but can greatly reduce the amount of Firestore Security Rules used by the collection
     */
    serverWriteOnly?: boolean
    /** Set to `true` to write custom Firestore Security Rules for the collection, at `firebase-rules/firestore.custom.rules` */
    customSecurityRules?: boolean
    /** Set to `true` to write custom Firebase Storage Rules for the collection */
    customStorageRules?: boolean
    /** Restrict a user's access to records with certain attributes */
    attributeRestrictions?: AttributeRestriction[]
    /** Explicitly define which specific records or groups of records can be accessed by a user */
    entityRestrictions?: EntityRestrictions
    /** Restrict which permissions a user role can assign to other user roles */
    permissionWriteRestrictions?: PermissionWriteRestriction[]
    /** Define which roles can perform which CRUD operations for the collection */
    operations: AccessOperations
    /**
     * Only relevant when `auth` is set to `true` in the root collection config.
     * `roles`: Roles that can be granted the ability to assign access credentials for this collection.
     * `assignable`: Optional subset of `roles` for which auth can be enabled or disabled per user.
     * Roles listed in `roles` but not in `assignable` are granted auth access automatically
     */
    auth?: { roles: StokerRole[]; assignable?: StokerRole[] }
    /** Define access rules for file uploads */
    files?: AccessFiles
}

/** Arguments for the preOperation hook, which fires before a read or write operation */
export type PreOperationHookArgs = {
    operation: "read" | "create" | "update" | "delete"
    data?: StokerRecord
    recordId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any
    batch?: WriteBatch
    originalRecord?: StokerRecord
}
/** Arguments for the preRead hook, which fires before a read operation */
export type PreReadHookArgs = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any
    refs: unknown[]
    multiple?: boolean
    listener?: boolean
}
/** Arguments for the postRead hook, which fires after a read operation */
export type PostReadHookArgs = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any
    refs: unknown[]
    record?: StokerRecord
    listener?: boolean
}
/** Arguments for the preDuplicate hook, which fires before a duplicate operation in the Admin UI */
export type PreDuplicateHookArgs = { data: Partial<StokerRecord> }
/** Arguments for the preValidate hook, which fires at write validation time */
export type PreValidateHookArgs = {
    operation: "create" | "update"
    data: StokerRecord
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any
    batch?: WriteBatch
    originalRecord?: StokerRecord
}
/** Arguments for the preWrite hook, which fires before a write operation */
export type PreWriteHookArgs = {
    operation: "create" | "update" | "delete"
    data: StokerRecord
    recordId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any
    batch?: WriteBatch
    originalRecord?: StokerRecord
}
/** Arguments for the postWrite hook, which fires after a write operation */
export type PostWriteHookArgs = {
    operation: "create" | "update" | "delete"
    data: StokerRecord
    recordId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any
    retry?: boolean
    originalRecord?: StokerRecord
}
/** Arguments for the postWriteError hook, which fires when a write operation encounters an error */
export type PostWriteErrorHookArgs = {
    operation: "create" | "update" | "delete"
    data: StokerRecord
    recordId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any
    error: unknown
    batch?: WriteBatch
    retry?: boolean
    retries?: number
    originalRecord?: StokerRecord
}
/** Arguments for the postOperation hook, which fires after a read or write operation */
export type PostOperationHookArgs = {
    operation: "read" | "create" | "update" | "delete"
    data?: StokerRecord
    recordId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any
    retry?: boolean
    originalRecord?: StokerRecord
}

/** The access permissions assigned to an uploaded file */
export type FilePermissions = {
    read?: string
    update?: string
    delete?: string
}

/** Arguments for the preFileAdd hook, which fires before a file is uploaded */
export type PreFileAddHookArgs = {
    record: StokerRecord
    fullPath: string
    filename: string
    permissions: FilePermissions
}

/** Arguments for the preFileUpdate hook, which fires before a file is updated */
export type PreFileUpdateHookArgs = {
    record: StokerRecord
    update:
        | { type: "rename"; oldPath: string; newPath: string }
        | {
              type: "permissions"
              path: string
              originalPermissions: FilePermissions
              permissions: FilePermissions
          }
}

/** Arguments for the postFileAdd hook, which fires after a file is uploaded */
export type PostFileAddHookArgs = {
    record: StokerRecord
    fullPath: string
    filename: string
    permissions: FilePermissions
}

/** Arguments for the postFileUpdate hook, which fires after a file is updated */
export type PostFileUpdateHookArgs = {
    record: StokerRecord
    update:
        | { type: "rename"; oldPath: string; newPath: string }
        | {
              type: "permissions"
              path: string
              originalPermissions: FilePermissions
              permissions: FilePermissions
          }
}

/** Arguments for the postFileAddError hook, which fires when a file upload fails */
export type PostFileAddErrorHookArgs = PostFileAddHookArgs & {
    error: unknown
}

/** Arguments for the setEmbedding hook, which calculates an embedding value for the record */
export type SetEmbeddingHookArgs = { record: StokerRecord }

export type HookArgs =
    | PreOperationHookArgs
    | PreReadHookArgs
    | PostReadHookArgs
    | PreDuplicateHookArgs
    | PreValidateHookArgs
    | PreWriteHookArgs
    | PostWriteHookArgs
    | PostWriteErrorHookArgs
    | PostOperationHookArgs
    | PreFileAddHookArgs
    | PreFileUpdateHookArgs
    | PostFileAddHookArgs
    | PostFileAddErrorHookArgs
    | PostFileUpdateHookArgs
    | SetEmbeddingHookArgs

/** Fires before a read or write operation. Return `false` to cancel the operation */
export type PreOperationHook = (args: PreOperationHookArgs) => boolean | void | Promise<boolean | void>
/** Fires before a read operation */
export type PreReadHook = (args: PreReadHookArgs) => void | Promise<void>
/** Fires after a read operation */
export type PostReadHook = (args: PostReadHookArgs) => void | Promise<void>
/** Fires before a duplicate operation in the Admin UI. Return `false` to cancel the operation */
export type PreDuplicateHook = (args: PreDuplicateHookArgs) => boolean | void | Promise<boolean | void>
/**
 * Fires at write validation time. This is where you can define custom validation logic.
 * Return an object with a boolean indicating whether validation passed, and a message to
 * display to the user if validation has failed
 */
export type PreValidateHook = (
    args: PreValidateHookArgs,
) => { valid: boolean; message?: string } | Promise<{ valid: boolean; message?: string }>
/** Fires before a write operation. Return `false` to cancel the operation */
export type PreWriteHook = (args: PreWriteHookArgs) => boolean | void | Promise<boolean | void>
/** Fires after a write operation */
export type PostWriteHook = (args: PostWriteHookArgs) => boolean | void | Promise<boolean | void>
/** Fires when a write operation encounters an error. May fire multiple times per write, so be sure to write idempotent code */
export type PostWriteErrorHook = (args: PostWriteErrorHookArgs) => boolean | void | Promise<boolean | void>
/** Fires after a read or write operation */
export type PostOperationHook = (args: PostOperationHookArgs) => boolean | void | Promise<boolean | void>

/** Fires before a file is uploaded. Return `false` to cancel the operation */
export type PreFileAddHook = (args: PreFileAddHookArgs) => boolean | void | Promise<boolean | void>
/** Fires before a file is updated. Return `false` to cancel the operation */
export type PreFileUpdateHook = (args: PreFileUpdateHookArgs) => boolean | void | Promise<boolean | void>
/** Fires after a file is uploaded */
export type PostFileAddHook = (args: PostFileAddHookArgs) => boolean | void | Promise<boolean | void>
/** Fires after a file is updated */
export type PostFileUpdateHook = (args: PostFileUpdateHookArgs) => boolean | void | Promise<boolean | void>
/** Fires when a file upload fails */
export type PostFileAddErrorHook = (args: PostFileAddErrorHookArgs) => void | Promise<void>

/** Calculate an embedding value for the record */
export type SetEmbeddingHook = (args: SetEmbeddingHookArgs) => string | Promise<string>

export type Hook =
    | PreOperationHook
    | PreReadHook
    | PostReadHook
    | PreDuplicateHook
    | PreValidateHook
    | PreWriteHook
    | PostWriteHook
    | PostWriteErrorHook
    | PostOperationHook
    | PreFileAddHook
    | PreFileUpdateHook
    | PostFileAddHook
    | PostFileAddErrorHook
    | PostFileUpdateHook
    | SetEmbeddingHook

export type Hooks = {
    /** Fires before a read or write operation. Return `false` to cancel the operation */
    preOperation?: PreOperationHook
    /** Fires before a read operation */
    preRead?: PreReadHook
    /** Fires after a read operation */
    postRead?: PostReadHook
    /** Fires before a duplicate operation in the Admin UI. Return `false` to cancel the operation */
    preDuplicate?: PreDuplicateHook
    /**
     * Fires at write validation time. This is where you can define custom validation logic.
     * Return an object with a boolean indicating whether validation passed, and a message to
     * display to the user if validation has failed
     */
    preValidate?: PreValidateHook
    /** Fires before a write operation. Return `false` to cancel the operation */
    preWrite?: PreWriteHook
    /** Fires after a write operation */
    postWrite?: PostWriteHook
    /** Fires when a write operation encounters an error. May fire multiple times per write, so be sure to write idempotent code */
    postWriteError?: PostWriteErrorHook
    /** Fires after a read or write operation */
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
    /** Calculate an embedding value for the record. Required for AI chat embeddings */
    setEmbedding?: SetEmbeddingHook
}

/** Preload a range of time-series data. The user will be able to update the preloaded range using a date picker in the Admin UI */
export interface PreloadCacheRange {
    /** Timestamp fields the user can preload by */
    fields: string[]
    /** Ranges of fields to preload, for example `["Start", "End"]`. Fields must also be listed in `fields` */
    ranges?: [string, string][]
    /** Human-readable labels for the fields listed in `fields` */
    labels?: string[]
    /** The default start date for the preloaded range */
    start: "Today" | "Week" | "Month" | "Year" | Date | number
    /** Offset the default start date by this many days */
    startOffsetDays?: number
    /** Offset the default start date by this many hours */
    startOffsetHours?: number
    /** The default end date for the preloaded range */
    end?: Date | number
    /** Offset the default end date by this many days */
    endOffsetDays?: number
    /** Offset the default end date by this many hours */
    endOffsetHours?: number
    /** Which selectors to show in the range picker */
    selector?: "range" | "week" | "month" | ("range" | "week" | "month")[]
}

/**
 * Preload data for the collection on app startup. Preloaded data is cached and is available
 * for the lifetime of the session, resulting in a snappy application that works offline.
 * Highly recommended for time series data
 */
export interface PreloadCache {
    /** The user roles that will use the preload cache */
    roles: StokerRole[]
    /** Whether to wait for related collections to load before signalling to the app that the collection is loaded */
    relationCollections?: boolean | (() => boolean | Promise<boolean>)
    /** Preload a range of time-series data. The user can update the preloaded range using a date picker in the Admin UI */
    range?: PreloadCacheRange
    /** Advanced. Additional Firestore constraints to apply to the preload cache */
    constraints?:
        | [string, WhereFilterOp, unknown][]
        | (() => [string, WhereFilterOp, unknown][] | Promise<[string, WhereFilterOp, unknown][]>)
}

/** The initial preload cache state for each collection */
export interface PreloadCacheInitial {
    [collection: string]: {
        roles: StokerRole[]
        range?: PreloadCacheRange
        constraints?: [string, WhereFilterOp, unknown][]
        orQueries?: [string, WhereFilterOp, unknown][]
    }
}

/** Custom code config for the collection, including hooks and server access control */
export interface CollectionCustom extends Hooks {
    /**
     * Define additional access control using code on the server. Only relevant if
     * `access.serverWriteOnly` is set to `true`. Return a boolean indicating whether or not
     * the access check passed. This code is not sent to the client
     */
    serverAccess?: {
        read?: (permissions: StokerPermissions, user: UserRecord, record?: StokerRecord) => boolean | Promise<boolean>
        create?: (permissions: StokerPermissions, user: UserRecord, record: StokerRecord) => boolean | Promise<boolean>
        update?: (
            permissions: StokerPermissions,
            user: UserRecord,
            record: StokerRecord,
            originalRecord?: StokerRecord,
        ) => boolean | Promise<boolean>
        delete?: (permissions: StokerPermissions, user: UserRecord, record: StokerRecord) => boolean | Promise<boolean>
    }
    /** Advanced. Additional Firestore constraints to apply to the preload cache */
    preloadCacheConstraints?:
        | [string, WhereFilterOp, unknown][]
        | (() => [string, WhereFilterOp, unknown][] | Promise<[string, WhereFilterOp, unknown][]>)
    /** Advanced. Firestore OR query constraints to apply to the preload cache */
    preloadCacheOrQueries?:
        | [string, WhereFilterOp, unknown][]
        | (() => [string, WhereFilterOp, unknown][] | Promise<[string, WhereFilterOp, unknown][]>)
    /** Return `true` to automatically rename duplicate records rather than throwing an error. Only relevant when `access.serverWriteOnly` is falsy */
    autoCorrectUnique?: boolean | (() => boolean | Promise<boolean>)
    /** Return `true` to disable adding new records while offline */
    disableOfflineCreate?: boolean | (() => boolean | Promise<boolean>)
    /** Return `true` to disable updating records while offline */
    disableOfflineUpdate?: boolean | (() => boolean | Promise<boolean>)
    /** Return `true` to disable deleting records while offline */
    disableOfflineDelete?: boolean | (() => boolean | Promise<boolean>)
}
export interface CollectionCustomCache {
    preloadCacheConstraints?: [string, WhereFilterOp, unknown][]
    preloadCacheOrQueries?: [string, WhereFilterOp, unknown][]
    autoCorrectUnique?: boolean
    disableOfflineCreate?: boolean
    disableOfflineUpdate?: boolean
    disableOfflineDelete?: boolean
}

/** Config for the list view */
export interface ListConfig {
    /** Limit which user roles can view the list */
    roles?: StokerRole[]
    /** Customise the title for the list tab. Defaults to `"List"` */
    title?: string
}

/** Show a board view with drag and drop and infinite scroll */
export interface CardsConfig {
    /** Limit which user roles can view the board */
    roles?: StokerRole[]
    /** The field that defines the board columns. Must be a String or Number field with `values`, or a Boolean field. Not required if `admin.statusField` has already been set */
    statusField?: string
    /** Exclude status values from the board */
    excludeValues?: string[] | number[]
    /** The sub-heading shown on cards */
    headerField: string
    /** The number of lines for the header field text */
    maxHeaderLines?: 1 | 2
    /** Sections to display on cards */
    sections: {
        /** The title for the section */
        title?: string
        /** The fields to display in the section */
        fields: string[]
        /** Show multiple columns of fields, rather than listing fields down the card vertically */
        blocks?: boolean
        /** Show a large field value */
        large?: boolean
        /** The number of lines for field text */
        maxSectionLines?: 1 | 2 | 3 | 4
        /** Only relevant when `blocks` is set to `true`. Hide the outermost block at this screen size. Helps with responsiveness */
        collapse?: "sm" | "md" | "lg" | "xl" | "2xl" | ((record?: StokerRecord) => "sm" | "md" | "lg" | "xl" | "2xl")
    }[]
    /** The footer field shown on cards */
    footerField?: string
    /** The number of lines for the footer field text */
    maxFooterLines?: 1 | 2
    /** Customise the title for the board tab. Defaults to `"Board"` */
    title?: string
    /** Tailwind classes to apply to the card component */
    cardClass?: string
}

/** Show a list of image cards with infinite scroll */
export interface ImagesConfig {
    /** Limit which user roles can view the images page */
    roles?: StokerRole[]
    /** The field that contains the image URL for the record. Must be a String field */
    imageField: string
    /** The image size */
    size: "sm" | "md" | "lg" | "xl"
    /** The number of lines for the header field text */
    maxHeaderLines?: 1 | 2
    /** Customise the title for the images tab. Defaults to `"Pics"` */
    title?: string
    /** An optional custom component shown above each image */
    customComponent?: {
        component: React.FC<{
            record: StokerRecord | undefined
            parentRecord?: StokerRecord
            collection: CollectionSchema
            parentCollection?: CollectionSchema
            isAssigning?: boolean
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            components: any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hooks: any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            utils: any
            setGlobalLoading: (operation: "+" | "-", id: string, server?: boolean, cache?: boolean) => void
        }>
        height: number
        condition?: (parentCollection?: CollectionSchema, parentRecord?: StokerRecord, isAssigning?: boolean) => boolean
    }
}

/** Show a map view */
export interface MapConfig {
    /** Limit which user roles can view the map page */
    roles?: StokerRole[]
    /** The field containing coordinates. Must be an Array field */
    coordinatesField?: string
    /** Alternatively, provide a String field containing an address */
    addressField?: string
    /** The starting coordinates for the map */
    center: {
        lat: number
        lng: number
    }
    /** The starting zoom value for the map */
    zoom: number
    /** Show a column of records without coordinates or an address. Records can be dragged onto the map (only when `coordinatesField` is provided) */
    noLocation?: {
        title: string
    }
    /** Customise the title for the map tab. Defaults to `"Map"` */
    title?: string
}

/** Show a calendar view. Requires a Fullcalendar license */
export interface CalendarConfig {
    /** Limit which user roles can view the calendar page */
    roles?: StokerRole[]
    /** Timestamp field specifying the start date of the event */
    startField: string
    /** Timestamp field specifying the end date of the event. If omitted, the start date is used */
    endField?: string
    /** Additional Timestamp fields to include as all-day events */
    additionalFields?: string[]
    /** Boolean field indicating whether records are all-day */
    allDayField?: string
    /** Fullcalendar options for desktop screen sizes */
    fullCalendarLarge?: CalendarOptions
    /** Fullcalendar options for mobile screen sizes */
    fullCalendarSmall?: CalendarOptions
    /** Relational field specifying a parent resource. Used for Fullcalendar features that require "resources" */
    resourceField?: string
    /** Field in the `resourceField` collection that acts as the resource title */
    resourceTitleField?: string
    /** Show a column of unscheduled records. Only relevant if `preloadCache.range` is present for the user's role. Records can be dragged onto the calendar */
    unscheduled?: {
        title: string
        roles?: StokerRole[]
    }
    /** Customise the title for the calendar tab. Defaults to `"Calendar"` */
    title?: string
    /** How far into the past to load records for */
    dataStart?: { days: number } | { weeks: number } | { months: number } | { years: number }
    /** How far into the future to load records for */
    dataEnd?: { days: number } | { weeks: number } | { months: number } | { years: number }
    /** Threshold at which more past records will be loaded */
    dataStartOffset?: { days: number } | { weeks: number } | { months: number } | { years: number }
    /** Threshold at which more future records will be loaded */
    dataEndOffset?: { days: number } | { weeks: number } | { months: number } | { years: number }
    /** The color for the provided record's event on the calendar */
    color?: string | ((record: StokerRecord) => string)
    /** A custom title for the provided record's event on the calendar */
    eventTitle?: (record: StokerRecord) => string
    /** Determines whether a record should be displayed on the calendar. This filter only runs in the client, so it should not be used for access control purposes */
    filterRecords?: (record: StokerRecord) => boolean
    /** Additional collections to show on the calendar. Only works when the preload cache is enabled for the user's role for the given collection */
    additionalCollections?: StokerCollection[]
}

/** Filter the list by the collection's status field */
export type StatusFilter = {
    type: "status"
    value?: string | number
    /** The roles that can see this filter */
    roles?: StokerRole[]
}

/** Filter the list by a Timestamp field */
export type RangeFilter = {
    type: "range"
    /** The Timestamp field to filter by */
    field: string
    /** Which selectors to show in the range picker */
    selector?:
        | "range"
        | "week"
        | "month"
        | ("range" | "week" | "month")[]
        | (() => "range" | "week" | "month" | ("range" | "week" | "month")[])
    value?: string
    /** Offset the default start date by this many days */
    startOffsetDays?: number
    /** Offset the default start date by this many hours */
    startOffsetHours?: number
    /** Offset the default end date by this many days */
    endOffsetDays?: number
    /** Offset the default end date by this many hours */
    endOffsetHours?: number
}

/** Filter the list by a field with `values` set */
export type SelectFilter = {
    type: "select"
    /** The field to filter by. Must have `values` set */
    field: string
    /** The title for the filter */
    title?: string | (() => string)
    /** The roles that can see this filter */
    roles?: StokerRole[]
    /** Modify the titles shown for filter values */
    titles?: (
        value: string,
        relationCollection?: CollectionSchema,
        relationParent?: StokerRecord,
        isAssigning?: boolean,
    ) => string
    /** Filter which values are shown in the filter */
    filterValues?: (
        value: boolean | string | number | undefined,
        relationCollection?: CollectionSchema,
        relationParent?: StokerRecord,
        isAssigning?: boolean,
    ) => boolean
    /** The default value for the filter */
    defaultValue?:
        | string
        | number
        | ((
              parentCollection?: CollectionSchema,
              parentRecord?: StokerRecord,
              isAssigning?: boolean,
          ) => string | number | undefined)
    /** Show or hide the filter */
    condition?: (parentCollection?: CollectionSchema, parentRecord?: StokerRecord, isAssigning?: boolean) => boolean
    value?: string | number
    /** The style of the filter input */
    style?: "select" | "radio" | "buttons"
}

/** Filter the list by a related field */
export type RelationFilter = {
    type: "relation"
    /** The relational field to filter by */
    field: string
    /** The title for the filter */
    title?: string | (() => string)
    /** The roles that can see this filter */
    roles?: StokerRole[]
    /** Filter the list of related values using a Firestore where() query */
    constraints?: [string, "==" | "in", unknown][]
    value?: string
}

/** A filter shown in the right-hand-side filter drawer on the list page */
export type Filter = StatusFilter | RangeFilter | SelectFilter | RelationFilter

/** Show a metric (numerical counter) at the top of the list page */
export interface Metric {
    /** The metric type. For "custom" metrics, use the `formula` method to calculate the value to display */
    type: "sum" | "average" | "count" | "custom"
    /** The field to aggregate. Not required for `count` or `custom` */
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
    /** Compact the metric vertically */
    compact?: boolean
    /** Custom metric calculation */
    formula?: (records: StokerRecord[]) => number | string
}
/** Show a chart at the top of the list page */
export interface Chart {
    /** The chart type */
    type: "area"
    /** The date field used to group points */
    dateField: string
    /** First metric field */
    metricField1?: string
    /** Optional second metric field */
    metricField2?: string
    /** Default chart date range */
    defaultRange: "90d" | "30d" | "7d"
    /** Limit which user roles can view the chart */
    roles?: StokerRole[]
    /** Title shown above the chart */
    title?: string
    /** Currency symbol to display */
    currency?: string | (() => string)
}
/** A custom meta title and description for the collection's pages */
export interface CollectionMeta {
    title?: string
    description?: string
}
/** Highlight rows in the list view */
export interface RowHighlight {
    /** Return `true` to highlight the row for the given record */
    condition: (record: StokerRecord) => boolean
    /** The Tailwind classes to apply to the highlighted row */
    className: string
    /** The user roles to highlight rows for */
    roles?: StokerRole[]
}
/** Converting a record creates a new record in the target collection and keeps the original */
export interface Convert {
    /** The collection to convert records to */
    collection: string
    /** A function that modifies the record before conversion */
    convert: (record: StokerRecord) => Partial<StokerRecord> | Promise<Partial<StokerRecord>>
    /** The roles that can perform this conversion */
    roles?: StokerRole[]
}
/** A custom form field component */
export interface CustomField {
    /** The position of the custom component in the form */
    position?: number | ((record?: StokerRecord) => number)
    /** The React component */
    component?: React.FC
    /** Props to pass to the React component */
    props?: Record<string, unknown>
    /** Show or hide the custom component */
    condition?: (operation: "create" | "update" | "update-many", record?: StokerRecord) => boolean
}
/** Show a relation list directly on the edit record form page */
export interface FormList {
    /** The collection to show the relation list for */
    collection: StokerCollection
    /** Which columns to show in the list */
    fields: string[]
    /** The field to sort records by */
    sortField?: string
    /** The direction to sort records by */
    sortDirection?: "asc" | "desc"
    /** The title for the relation list */
    label?: string
}

/** A custom button shown at the bottom of the edit record form */
export interface FormButton {
    /** The title text for the custom button */
    title: string
    /** The icon shown on the button */
    icon?: React.FC<{ className?: string }>
    /** The style of the button */
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    /** The function that fires when the button is clicked */
    action: (
        operation: "create" | "update" | "update-many",
        formValues: StokerRecord,
        originalRecord?: StokerRecord,
    ) => void | Promise<void>
    /** Show or hide the button */
    condition?: boolean | ((operation: "create" | "update" | "update-many", record?: StokerRecord) => boolean)
    /** A loading callback that will be called when the button is pressed */
    setIsLoading?: (isLoading: boolean) => void
}

/** A custom page for the collection, shown in the record page sidebar */
export interface CustomRecordPage {
    /** The title for the custom page in the sidebar */
    title: string
    /** The URL segment that the page will load on */
    url: string
    /** The custom component */
    component: React.FC<{
        record: StokerRecord | undefined
        collection: CollectionSchema
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        components: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hooks: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        utils: any
    }>
    /** Props to pass to the custom component */
    props?: Record<string, unknown>
    /** Show or hide the custom page */
    condition?: (record: StokerRecord | undefined) => boolean
    /** The icon shown in the sidebar */
    icon?: React.FC<{ className?: string }>
}

export interface Assignable {
    collection: string
    isAvailable: (record: StokerRecord) => boolean
    unavailableField?: string
    includeAssignedInFilters?: string[]
    includeValueInFilters?: {
        field: string
        values: unknown[]
        includeValue: unknown
    }[]
}

/** A custom action shown in a dropdown menu on the list page */
export interface CustomListAction {
    /** The title for the action */
    title: string
    /** The icon shown for the action */
    icon?: React.FC<{ className?: string }>
    /** The function that fires when the action is clicked */
    action: () => void | Promise<void>
    /** Show or hide the action */
    condition?: () => boolean
}

/** Options for file uploads */
export interface FileOptions {
    /** The maximum width for uploaded image files. Images above this size will be downscaled */
    maxImageWidth?: number
    /** Set to `true` to show thumbnails for images in the files list */
    thumbnails?: boolean
}

/** Admin UI config for the collection */
export interface CollectionAdmin {
    /** Return `true` to hide the collection in the Admin UI */
    hidden?: boolean | (() => boolean | Promise<boolean>)
    /** The collection's position in the navbar */
    navbarPosition?: number | (() => number)
    /** Human-readable labels for the collection. Only necessary if the root `labels` are not human-readable */
    titles?:
        | {
              collection: string
              record: string
          }
        | ((
              context?: "permissions" | "search-all" | "relation-list",
              parentCollection?: CollectionSchema,
              parentRecord?: StokerRecord,
          ) => { collection: string; record: string } | Promise<{ collection: string; record: string }>)
    /** An icon component for the collection. We recommend using Lucide icons, which are bundled with Stoker */
    icon?: React.FC | (() => React.FC | Promise<React.FC>)
    /** Return `true` to show the "Duplicate" button on the form page */
    duplicate?: boolean | (() => boolean | Promise<boolean>)
    /** Define which collections records can be converted to. A "Convert" button will be shown on the form page */
    convert?: Convert[] | (() => Convert[] | Promise<Convert[]>)
    /**
     * Set to `true` to have the form page live-update when the record is updated remotely.
     * Can also be configured at the field-level. Note: on a live form remote updates will
     * overwrite local changes, introducing a risk of data loss
     */
    live?: boolean | (() => boolean | Promise<boolean>)
    /**
     * Define a field that will be used to sort records into "Active" and "Archived" lists,
     * i.e. `{ field: "Status", active: ["Not Started", "In Progress"], archived: ["Completed"] }`
     */
    statusField?: {
        /** The field that defines the active / archived status */
        field: string
        /** Values considered active */
        active?: unknown[]
        /** Values considered archived */
        archived?: unknown[]
    }
    /** The default view for the collection */
    defaultView?:
        | "list"
        | "cards"
        | "images"
        | "map"
        | "calendar"
        | ((
              parentCollection: CollectionSchema,
              parentRecord?: StokerRecord,
          ) => "list" | "cards" | "images" | "map" | "calendar")
    /** The default route for the record page. Can be "edit", "files", a relation list collection name or a custom record page url */
    defaultRoute?: string | (() => string)
    /** The default field to sort the list by */
    defaultSort?:
        | {
              field: string
              direction?: "asc" | "desc"
          }
        | (() =>
              | {
                    field: string
                    direction?: "asc" | "desc"
                }
              | Promise<{
                    field: string
                    direction?: "asc" | "desc"
                }>)
    /** The secondary field to sort the list by. Only works for collections with `preloadCache` or `access.serverReadOnly` enabled */
    secondarySort?:
        | {
              field: string
              direction?: "asc" | "desc"
          }
        | (() =>
              | {
                    field: string
                    direction?: "asc" | "desc"
                }
              | Promise<{
                    field: string
                    direction?: "asc" | "desc"
                }>)
    /** The number of items to show per page */
    itemsPerPage?: number | (() => number | Promise<number>)
    /**
     * Full text search options. For roles with the preload cache or `access.serverReadOnly`
     * enabled, provide MiniSearch settings. For other roles, provide `{ hitsPerPage?: number }`
     * to specify the maximum number of results to retrieve from Algolia
     */
    searchOptions?: SearchOptions & { hitsPerPage?: number }
    /** Config for the list view */
    list?: ListConfig | (() => ListConfig | Promise<ListConfig>)
    /** Show a board view with drag and drop and infinite scroll */
    cards?: CardsConfig | (() => CardsConfig | Promise<CardsConfig>)
    /** Show a list of image cards with infinite scroll */
    images?: ImagesConfig | (() => ImagesConfig | Promise<ImagesConfig>)
    /** Show a map view */
    map?: MapConfig | (() => MapConfig | Promise<MapConfig>)
    /** Show a calendar view. Requires a Fullcalendar license */
    calendar?: CalendarConfig | (() => CalendarConfig | Promise<CalendarConfig>)
    /** Filters that will appear in the right-hand-side filter drawer on the list page */
    filters?: Filter[]
    /** The date range selector options to be shown to the user. Only relevant when `preloadCache.range` is present */
    rangeSelectorValues?:
        | "range"
        | "week"
        | "month"
        | ("range" | "week" | "month")[]
        | (() => "range" | "week" | "month" | ("range" | "week" | "month")[])
    /** The default date range selector to be shown to the user. Only relevant when `preloadCache.range` is present or a range filter has been applied */
    defaultRangeSelector?: "range" | "week" | "month" | (() => "range" | "week" | "month")
    /** Restrict CSV export to the defined roles */
    restrictExport?: StokerRole[] | (() => StokerRole[] | Promise<StokerRole[]>)
    /** Display a counter in the title bar showing the number of items in the list */
    titleCount?: boolean | (() => boolean | Promise<boolean>)
    /** Show metrics (numerical counters) and a chart at the top of the list page. We recommend 1-2 metrics and a chart */
    metrics?: (Metric | Chart)[] | (() => (Metric | Chart)[] | Promise<(Metric | Chart)[]>)
    /** Define a custom meta title and description for the collection's pages */
    meta?: CollectionMeta | (() => CollectionMeta | Promise<CollectionMeta>)
    /** Highlight rows in the list view */
    rowHighlight?: RowHighlight[] | (() => RowHighlight[])
    /** An array of relational field names that will be used to show breadcrumbs at the top of the record page */
    breadcrumbs?: string[] | (() => string[] | Promise<string[]>)
    /** Create custom form field components */
    customFields?: CustomField[] | (() => CustomField[] | Promise<CustomField[]>)
    /** Create custom pages for the collection */
    customRecordPages?: CustomRecordPage[] | (() => CustomRecordPage[] | Promise<CustomRecordPage[]>)
    /** Show custom buttons at the bottom of the edit record form */
    formButtons?: FormButton[] | (() => FormButton[] | Promise<FormButton[]>)
    /** Show a file upload button on the add record form */
    formUpload?: boolean | (() => boolean | Promise<boolean>)
    /** Show an image carousel at the top of the edit record form. All image files uploaded to the record will be displayed */
    formImages?: boolean | (() => boolean | Promise<boolean>)
    /** Show relation lists directly on the edit record form page */
    formLists?: FormList[] | (() => FormList[] | Promise<FormList[]>)
    /** Hide the add record button */
    hideCreate?: boolean | ((relationList?: StokerCollection) => boolean | Promise<boolean>)
    /**
     * Disable the edit record form. Warning: this only disables editing client side.
     * Use `restrictUpdate` or `access.operations` to securely block record updates
     */
    disableUpdate?: boolean | ((operation: "create" | "update", record: StokerRecord) => boolean | Promise<boolean>)
    /**
     * A hook that fires when the record form is opened. When the "create" form is opened from
     * within another record's relation list, the parent collection and parent record are provided
     */
    onFormOpen?: (
        operation: "create" | "update",
        record: StokerRecord,
        parentCollection?: StokerCollection,
        parentRecord?: StokerRecord,
    ) => void | Promise<void>
    /** A hook that fires whenever the form is updated. Optionally return an object with field updates */
    onChange?: (
        operation: "create" | "update",
        record: StokerRecord,
        originalRecord: StokerRecord,
    ) => Partial<StokerRecord> | void | Promise<Partial<StokerRecord> | void>
    /** Override the default behaviour of opening the add record form */
    addRecordButtonOverride?: (record?: StokerRecord) => void | Promise<void>
    /** Disable the date range selector for the user */
    disableRangeSelector?: boolean | (() => boolean)
    /** Load data for use in your computed fields, once per query */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    retriever?: () => any | Promise<any>
    assignable?: Assignable[] | (() => Assignable[] | Promise<Assignable[]>)
    /** Custom actions that will be shown in a dropdown menu on the list page */
    customListActions?: CustomListAction[] | (() => CustomListAction[] | Promise<CustomListAction[]>)
    /** Options for file uploads */
    fileOptions?: FileOptions | (() => FileOptions | Promise<FileOptions>)
}
export interface CollectionAdminCache {
    hidden?: boolean
    navbarPosition?: number
    titles?: {
        collection: string
        record: string
    }
    icon?: React.FC
    duplicate?: boolean
    convert?: Convert[]
    live?: boolean
    statusField?: {
        field: string
        active?: unknown[]
        archived?: unknown[]
    }
    defaultView?: "list" | "cards" | "images" | "map" | "calendar"
    defaultRoute?: string
    defaultSort?: {
        field: string
        direction?: "asc" | "desc"
    }
    secondarySort?: {
        field: string
        direction?: "asc" | "desc"
    }
    searchOptions?: SearchOptions & { hitsPerPage?: number }
    itemsPerPage?: number
    list?: ListConfig
    cards?: CardsConfig
    images?: ImagesConfig
    map?: MapConfig
    calendar?: CalendarConfig
    filters?: Filter[]
    rangeSelectorValues?: "range" | "week" | "month" | ("range" | "week" | "month")[]
    defaultRangeSelector?: "range" | "week" | "month"
    restrictExport?: StokerRole[]
    metrics?: (Metric | Chart)[]
    meta?: CollectionMeta
    rowHighlight?: RowHighlight[]
    breadcrumbs?: string[]
    customFields?: CustomField[]
    customRecordPages?: CustomRecordPage[]
    formButtons?: FormButton[]
    formUpload?: boolean
    formImages?: boolean
    formLists?: FormList[]
    hideCreate?: boolean
    disableUpdate?: boolean
    disableRangeSelector?: boolean
    assignable?: Assignable[]
    customListActions?: CustomListAction[]
    fileOptions?: FileOptions
}

/** Custom code config for the field, including hooks and server access control */
export interface FieldCustom extends Hooks {
    /** Calculate an initial value for this field when creating the record */
    initialValue?: unknown | ((record?: StokerRecord) => unknown | Promise<unknown>)
    /**
     * Define additional access control using code on the server. Only relevant if
     * `access.serverWriteOnly` is set to `true`. Return a boolean indicating whether or not
     * the access check passed. This code is not sent to the client
     */
    serverAccess?: {
        read?: (permissions: StokerPermissions, user: UserRecord, record?: StokerRecord) => boolean | Promise<boolean>
        create?: (permissions: StokerPermissions, user: UserRecord, record: StokerRecord) => boolean | Promise<boolean>
        update?: (
            permissions: StokerPermissions,
            user: UserRecord,
            record: StokerRecord,
            originalRecord?: StokerRecord,
        ) => boolean | Promise<boolean>
    }
}

/** Display a conditional description message under the field in the Admin UI */
export interface FieldDescription {
    /** The description message to display */
    message: string | ((record?: StokerRecord) => string | Promise<string>)
    /** Show or hide the description */
    condition?: boolean | ((record?: StokerRecord) => boolean | Promise<boolean>)
}

/** Config for a coordinates field, providing the starting location and zoom for the map */
export interface LocationFieldAdmin {
    /** The starting coordinates for the map */
    center: {
        lat: number
        lng: number
    }
    /** The starting zoom value for the map */
    zoom: number
}

/** An icon shown for the field on the form page */
export interface FormFieldIcon {
    /** The icon component */
    component: React.FC
    /** Additional Tailwind classes for the icon */
    className?: string
}

/** Admin UI config for the field */
export interface FieldAdmin {
    /** A human-readable name for the field. Only necessary if `name` is not human-readable */
    label?: string | (() => string)
    /** Override the field name shown in the list view */
    listLabel?: string | (() => string)
    /** An icon that will be shown for the field on the form page */
    icon?: FormFieldIcon | (() => FormFieldIcon | Promise<FormFieldIcon>)
    /**
     * Show or hide the field in the list view and on the form page. The list method receives
     * the parent collection and parent record when shown on a relation list page. The form
     * method receives `isExport` as `true` during CSV export operations
     */
    condition?: {
        list?: boolean | ((parentCollection?: CollectionSchema, parentRecord?: StokerRecord) => boolean)
        form?: boolean | ((operation?: "create" | "update", record?: StokerRecord, isExport?: boolean) => boolean)
    }
    /** Return `true` to set this as a read-only field in the Admin UI */
    readOnly?: boolean | ((operation?: "create" | "update", record?: StokerRecord) => boolean)
    /** Display a conditional description message under the field in the Admin UI */
    description?: FieldDescription
    /** Set to `true` on a String field to make it a textarea */
    textarea?: boolean | (() => boolean | Promise<boolean>)
    /** Set to `true` on a String field with `values` to make it a radio group */
    radio?: boolean | (() => boolean | Promise<boolean>)
    /** Set to `true` on a String field with `values` to make it a button group */
    buttonGroup?: boolean | (() => boolean | Promise<boolean>)
    /** Set to `true` on a Boolean field to make it a switch */
    switch?: boolean | (() => boolean | Promise<boolean>)
    /** Set to `true` on a Timestamp field to make it a month picker */
    month?: boolean | (() => boolean | Promise<boolean>)
    /** Set to `true` on a Number field to make it a slider */
    slider?: boolean | (() => boolean | Promise<boolean>)
    /** Set to `true` on a Map field to make it a rich text field */
    richText?: boolean | (() => boolean | Promise<boolean>)
    /** Set on an Array field to make it a coordinates field. Provide starting location coordinates and zoom */
    location?: LocationFieldAdmin | (() => LocationFieldAdmin | Promise<LocationFieldAdmin>)
    /** Set to `true` on a String field to make it a time field, or on a Timestamp field to make it a datetime field */
    time?: boolean | (() => boolean)
    /** Set on a String field to make it an image field. Images can be uploaded, or selected from files uploaded to the record */
    image?: boolean | (() => boolean)
    /** For Array fields. Provide an array of Tailwind classes to have values appear as colored badges. The order must match the field's `values` array */
    tags?: string[] | (() => string[])
    /** Set to `true` to have the field live-update on the form page when the record is updated remotely */
    live?: boolean | (() => boolean | Promise<boolean>)
    /** Set the position of the field in the list and the form. Defaults to the position of the field in the fields array */
    column?: boolean | number | (() => boolean | number)
    /** Set on a String field to make it a badge. Return a Tailwind class specifying the color for the badge */
    badge?: boolean | string | ((record?: StokerRecord) => boolean | string)
    /** The screen size at which the field should be hidden from the list view. This is useful for responsiveness */
    hidden?: "sm" | "md" | "lg" | "xl" | "2xl" | ((record?: StokerRecord) => "sm" | "md" | "lg" | "xl" | "2xl")
    /** Set to `true` on a String field to make it italic */
    italic?: boolean | ((record?: StokerRecord) => boolean)
    /** Set to a currency symbol to make the field a currency */
    currency?: string | ((record?: StokerRecord) => string)
    /** The returned value will be used for sorting in the list view */
    sort?: (record?: StokerRecord) => unknown
    /** Set to `true` to exclude this field from CSV export */
    noExport?: boolean | (() => boolean)
    /** Set on an Array or relational field to specify the separator to be used between items in CSV export. Defaults to `", "` */
    exportSeparator?: string | (() => string)
    /**
     * Set to `true` to skip required validation on the form page. This is useful if the required
     * field value will be set after the form has been submitted, for example in `custom.initialValue` or a hook
     */
    skipFormRequiredValidation?: boolean | (() => boolean)
    /** Conditionally set a field to "required". This overrides `required`, however `required` will still be enforced on the server if present */
    overrideFormRequiredValidation?: (
        operation: "create" | "update",
        record?: StokerRecord,
        originalRecord?: StokerRecord,
    ) => boolean
    /** Filter the options in the dropdown for String or Number fields with `values` set */
    filterValues?: (value: string | number, parentCollection: CollectionSchema, parentRecord?: StokerRecord) => boolean
    /** Filter the options in the dropdown for relational fields. Only works when `preloadCache` is enabled for the user's role */
    filterResults?: (result: StokerRecord, parentCollection: CollectionSchema, parentRecord?: StokerRecord) => boolean
    /** Modify the results in the dropdown for relational fields */
    modifyResultTitle?: (
        record: StokerRecord,
        parentCollection: CollectionSchema,
        parentRecord?: StokerRecord,
    ) => string
    /** Modify the displayed value for the field, for example when shown in the list view or when read-only on a form */
    modifyDisplayValue?: (record?: StokerRecord, context?: "card" | "form" | "list" | "export") => unknown
    /**
     * Return a custom component to be used in the list view. Set `receiveClick` to `true` to have the
     * component receive the click and override the default behaviour of navigating to the record page
     */
    customListView?: (
        record?: StokerRecord,
        parentCollection?: CollectionSchema,
        parentRecord?: StokerRecord,
    ) =>
        | {
              component: React.FC
              props?: Record<string, unknown>
              receiveClick?: boolean
          }
        | undefined
    /** When using include fields on a relation field, return `true` to force the full relation record to be loaded (on the form page only) */
    queryFullRecord?: boolean | (() => boolean)
    /** Display a Computed field value as rich text */
    asRichText?: boolean | (() => boolean)
}

/**
 * Grant users access to the specified field in the related collection. This lets users select
 * values from a dropdown without giving them full access to the related collection
 */
export interface DependencyField {
    /** The field in the related collection to grant access to */
    field: string
    /** The roles to grant access to */
    roles: StokerRole[]
}
/** Enforce the relational integrity of the field. For example, ensure that the record's "Site" is actually related to the record's "Company" */
export interface EnforceHierarchy {
    /** Another relational field in the collection that is above the current field in the relational hierarchy */
    field: string
    /** The field in the related collection above that links to the same collection as the current field */
    recordLinkField: string
}
/**
 * Place a single field exemption on the field in Firestore. If `indexExemption` is set at the
 * collection level, this option will re-enable indexing for the field. Consider exempting
 * incrementally increasing monotonic fields, large String fields, Map fields and Array fields
 */
export interface SingleFieldExemption {
    queryScope: "COLLECTION" | "COLLECTION_GROUP"
    order?: "ASCENDING" | "DESCENDING"
    arrayConfig?: "CONTAINS" | "CONTAINS_ANY"
}

export interface FieldAccessCondition {
    /** All roles that this field group CAN apply to */
    applicableRoles: StokerRole[]
    match?: "any" | "all"
    /** Require collection auth access to equal this value for the current user */
    collectionAuth?: boolean
    /** The current user's role must be one of these */
    roles?: StokerRole[]
    /** How to combine the provided checks */
    /**
     * Auth token claim checks. A scalar value requires equality.
     * An array requires the claim value to be one of the listed values.
     * All entries must match.
     */
    claims?: Record<string, string | number | boolean | (string | number | boolean)[]>
    /**
     * Required state of this collection's permission restrictions for the current user.
     * All entries must match.
     */
    restrictions?: {
        /** collection recordOwner restriction must equal this */
        recordOwner?: boolean
        /** collection recordUser restriction must equal this */
        recordUser?: boolean
        /** collection recordProperty restriction must equal this */
        recordProperty?: boolean
        /** collection restrictEntities restriction must equal this */
        restrictEntities?: boolean
    }
}

export interface FieldAccessGroupReference {
    /** Key of a fieldAccessGroups entry on the collection */
    group: string
}

/** Properties that can be set on any field type */
export interface StandardField {
    /** The name of the field. It must not have spaces (use underscores). You can set a human-readable name in `admin.label` */
    name: string
    /** A description for the field for LLMs. Only relevant if `ai` is configured */
    description?: string | (() => string | Promise<string>)

    /**
     * Place a single field exemption on the field in Firestore. If `indexExemption` is set at
     * the collection level, this option will re-enable indexing for the field
     */
    singleFieldExemption?: SingleFieldExemption[] | boolean
    /**
     * Specifies that this field will be used for sorting. Not required if all user roles have
     * `preloadCache` or `access.serverReadOnly` enabled (sorting is automatic in these cases).
     * Set to `true` to sort by "asc" and "desc" for all user roles, or provide more granular config
     */
    sorting?:
        | boolean
        | {
              direction?: "asc" | "desc"
              roles?: StokerRole[]
          }

    /** Set to `true` if the field is a required field */
    required?: boolean
    /** Set to `true` if the field is a nullable field */
    nullable?: boolean

    /**
     * In auth collections, set to `true` to add the field to the linked user's auth token.
     * Be sure to control access to auth token fields using `restrictCreate` and `restrictUpdate`
     */
    saveToAuthToken?: boolean

    /**
     * Controls which users can access the field. Provide an array of user roles for static access,
     * or reference a field access group with `{ group }` for conditional access.
     * Warning: omitting the access property altogether allows access by ALL roles
     */
    access?: StokerRole[] | FieldAccessGroupReference
    /**
     * Set to `true` to prevent this field from being included when the record is created.
     * Alternatively, provide an array of user roles that CAN provide the field when creating
     * a record, or a FieldAccessCondition for even more granular access control
     */
    restrictCreate?: StokerRole[] | boolean | FieldAccessCondition
    /**
     * Set to `true` to prevent this field from being changed when the record is updated.
     * Alternatively, provide an array of user roles that CAN change the field when updating
     * a record, or a FieldAccessCondition for even more granular access control
     */
    restrictUpdate?: StokerRole[] | boolean | FieldAccessCondition
    /**
     * Skip Firestore Security Rules validation for this field. This can help to keep the size of
     * the security ruleset down. Validation will be performed post-write in a Cloud Function, and
     * you will receive an email if invalid data has been submitted
     */
    skipRulesValidation?: boolean

    /** Custom code config for the field, including hooks and server access control */
    custom?: FieldCustom
    /** Admin UI config for the field */
    admin?: FieldAdmin
}
export interface BooleanField extends StandardField {
    type: "Boolean"
}
export interface StringField extends StandardField {
    type: "String"
    /** An optional list of values. This will result in a dropdown list being shown in the Admin UI */
    values?: string[]
    /**
     * Set to `true` to make the field a unique field. Be sparing with this option unless
     * `access.serverWriteOnly` is set to `true`. Case is ignored when determining whether or not
     * a value is a duplicate. Unique field values are NOT freed up when a record is soft-deleted
     */
    unique?: boolean

    /** Specify a fixed length for the field */
    length?: number
    /** Specify a minimum length for the field */
    minlength?: number
    /** Specify a maximum length for the field */
    maxlength?: number
    /** Specify a regex pattern for the field */
    pattern?: string

    /** Set to `true` if the field is an email address. Only validated server-side if `access.serverWriteOnly` is `true` */
    email?: boolean
    /** Set to `true` if the field is a url. Only validated server-side if `access.serverWriteOnly` is `true` */
    url?: boolean
    /** Set to `true` if the field is an emoji. Only validated server-side if `access.serverWriteOnly` is `true` */
    emoji?: boolean
    /** Set to `true` if the field is a UUID. Only validated server-side if `access.serverWriteOnly` is `true` */
    uuid?: boolean
    /** Set to `true` if the field is an IP address. Only validated server-side if `access.serverWriteOnly` is `true` */
    ip?: boolean
}
export interface NumberField extends StandardField {
    type: "Number"
    /** An optional list of values. This will result in a dropdown list being shown in the Admin UI */
    values?: number[]
    /**
     * Set to `true` to make the field a unique field. Be sparing with this option unless
     * `access.serverWriteOnly` is set to `true`. Unique field values are NOT freed up when a record is soft-deleted
     */
    unique?: boolean

    /**
     * Set to `true` to make the field an auto-incremented number. Auto-incremented numbers are
     * written by a Cloud Function after the record has been saved to the server, so numbers for
     * offline writes won't appear until the user has reconnected
     */
    autoIncrement?: boolean
    /** Set the maximum number of decimal places for this field */
    decimal?: number

    /** Set the maximum number value for this field */
    max?: number
    /** Set the minimum number value for this field */
    min?: number
}
export interface TimestampField extends StandardField {
    type: "Timestamp"
    /** An optional list of dates in milliseconds format. This will result in a dropdown list being shown in the Admin UI */
    values?: number[]

    /** Set the maximum milliseconds value for this field */
    max?: number
    /** Set the minimum milliseconds value for this field */
    min?: number
}
export interface ArrayField extends StandardField {
    type: "Array"
    /** A list of values. A dropdown selector will be shown in the Admin UI */
    values?: string[]

    /** Set the exact required length for this field */
    length?: number
    /** Set the minimum length for this field */
    minlength?: number
    /** Set the maximum length for this field */
    maxlength?: number
}
export interface MapField extends StandardField {
    type: "Map"
}
export interface RelationField extends StandardField {
    type: "OneToOne" | "OneToMany" | "ManyToOne" | "ManyToMany"
    /** The collection for the relational field */
    collection: StokerCollection
    /**
     * Enable a two-way relation. Provide the name of a relational field in the target collection
     * to link with. Requires `access.serverWriteOnly`
     */
    twoWay?: string
    /**
     * Save fields from the related record to the target record. Field values will be denormalized
     * and will automatically update when the source record is updated. Updates are written by a
     * Cloud Function, so updates made in offline mode won't appear until the user has reconnected
     */
    includeFields?: string[]
    /** Choose one of the `includeFields` values to act as the title field for the related record */
    titleField?: string
    /** Set to `true` to preserve relation data when the related record is deleted. Warning: this may have privacy implications */
    preserve?: boolean
    /**
     * Set to `true` to allow users to write any value to the relational field. By default, users
     * can only write values for records that they have access to. Warning: this may have security implications
     */
    writeAny?: boolean
    /**
     * Grant users access to the specified fields in the related collection. This lets users select
     * values from a dropdown without giving them full access to the related collection
     */
    dependencyFields?: DependencyField[]
    /** Enforce the relational integrity of the field. For example, ensure that the record's "Site" is actually related to the record's "Company" */
    enforceHierarchy?: EnforceHierarchy
    /** Set the minimum number of relations for this field */
    min?: number
    /** Set the maximum number of relations for this field */
    max?: number
    /** Set the exact number of relations required for this field */
    length?: number
    /** Firestore where() query constraints that will be applied when retrieving records for the dropdown selector */
    constraints?: [string, "==" | "in", unknown][]
}
export interface EmbeddingField extends StandardField {
    type: "Embedding"
}
export interface ComputedField extends StandardField {
    type: "Computed"
    /**
     * Calculates the value for the field. When using `getSome` or `subscribeMany`, `retrieverData`
     * will return the data provided by the collection's `retriever` function. This lets you load
     * data sets for your computed field formulas once per query
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formula: (record: StokerRecord, retrieverData?: any) => string | number | Promise<string | number>
}
/** A field in a Stoker collection */
export type CollectionField =
    | BooleanField
    | StringField
    | NumberField
    | TimestampField
    | ArrayField
    | MapField
    | RelationField
    | EmbeddingField
    | ComputedField

/** Make a system field (i.e. `Created_At`, `Last_Write_By`) accessible to the given roles */
export interface RoleSystemField {
    /** The name of the system field */
    field: string
    /** The roles that can access the field */
    roles?: StokerRole[]
}

/** The customization (custom code and Admin UI config) for a collection */
export interface CollectionCustomization {
    custom?: CollectionCustom
    admin?: CollectionAdmin
    fields: {
        name: string
        custom?: FieldCustom
        admin?: FieldAdmin
        formula?: (record: StokerRecord) => string | number
    }[]
}

/**
 * Advanced. Define fields that will be indexed for querying. Only relevant if you are using
 * Stoker as a headless CMS. This option is handled automatically by the Admin UI
 */
export interface Query {
    /** The name of the field */
    field: string
    /** Set to `true` if the field is a Timestamp field */
    range?: boolean
    /** Set to `true` if the field needs to be indexed independently of sorting */
    standalone?: boolean
    /** The user roles that will run the query */
    roles?: StokerRole[]
}

/** A "child list" that will appear in the Admin UI for records in this collection, i.e. lists of related "Sites" on a "Clients" record page */
export interface RelationList {
    /** The collection for the relation list */
    collection: StokerCollection
    /** The field in the current collection that relates to the collection above */
    field: string
    /** The roles that can see this relation list */
    roles?: StokerRole[]
    /** Firestore constraints to apply to the relation list query */
    constraints?: [string, "==" | "in", unknown][]
    /** When `preloadCache.range` is enabled, setting this option will ignore the range restrictions and load all records available for the relation list */
    loadAll?: boolean
    /** Show metrics above the list in the Admin UI */
    showMetrics?: boolean
    /** A list of filters to show in the LHS sidebar when the relation list is active */
    showFilters?: string[]
}

/** The schema for a Stoker collection. Each collection represents a collection in Cloud Firestore, and a page in the Admin UI */
export interface CollectionSchema {
    /** The names for the collection. Names must start with a capital letter and contain only letters, digits, and underscores */
    labels: CollectionLabels
    /** Access control config for the collection */
    access: CollectionAccess
    /** The fields for the collection */
    fields: (CollectionField | RelationField)[]
    /** The field in the collection that will be used as the record's title, i.e. "Name" */
    recordTitleField: string

    /** Set to `true` if this collection is a "users" collection. Records in the collection can then be assigned access credentials */
    auth?: boolean
    /**
     * Set to `true` if the collection will only have one record / page, i.e. "Settings".
     * No list page will be shown in the Admin UI; the user will be sent straight to the form page
     */
    singleton?: boolean
    /**
     * Advanced. Set to the collection's parent collection if this collection will be a subcollection
     * in Firestore. Subcollections are not currently supported in the Admin UI
     */
    parentCollection?: StokerCollection

    /**
     * Named conditional field access groups. Fields reference a group with
     * access: { group }.
     */
    fieldAccessGroups?: Record<string, FieldAccessCondition>

    /**
     * Preload data for the collection on app startup. Preloaded data is cached and is available
     * for the lifetime of the session. Highly recommended for time series data
     */
    preloadCache?: PreloadCache
    /** Enable soft-delete for this collection */
    softDelete?: {
        /** The name of a Boolean field. This field will be set to `true` when the record is soft-deleted */
        archivedField: string
        /** The name of a Timestamp field. This field will be set to the current time when the record is soft-deleted */
        timestampField: string
        /** The number of days after which soft-deleted records will be permanently deleted */
        retentionPeriod: number
    }

    /** Advanced. Define fields that will be indexed for querying. Only relevant if you are using Stoker as a headless CMS */
    queries?: Query[]
    /** Define "child lists" that will appear in the Admin UI for records in this collection */
    relationLists?: RelationList[]
    /** Set to `true` to allow fields that are not defined in the schema to be written to records in the collection */
    allowSchemalessFields?: boolean
    /**
     * Set to `true` to enable the write log for this collection. Every write to a record will be
     * logged in Firestore, creating a history that can be used for data recovery and audit purposes
     */
    enableWriteLog?: boolean
    /**
     * Set to `true` to preserve write log entries for deleted records. If not enabled, all write
     * log entries for a record will be deleted on record delete
     */
    preserveWriteLog?: boolean
    /**
     * An array of field names. These fields will be searchable. For collections without
     * `preloadCache` or `serverReadOnly` set to `true`, you will need to set up Algolia
     */
    fullTextSearch?: string[]
    /**
     * The name of a Timestamp field containing an automatic deletion date for the record,
     * i.e. "Expires_At". Warning: denormalized data is not currently deleted by TTL policies
     */
    ttl?: string
    /**
     * Set to `true` to exempt this collection from Firestore indexing. Indexes that are required
     * for your app to function will be re-added automatically. Improves performance and reduces
     * costs, but may prevent queries outside of the standard queries used by your app
     */
    indexExemption?: boolean
    /** Make system fields (i.e. `Created_At`, `Last_Write_By`) accessible to your app's users */
    roleSystemFields?: RoleSystemField[]
    /**
     * Set to `true` to skip Firestore Security Rules validation of writes, for collections that hit
     * the limit of 1000 expressions per request. Validation will be run post-write in a Cloud
     * Function, and you will get an email if invalid data is submitted
     */
    skipRulesValidation?: boolean
    /** Enable an AI chat bot for the collection. The chat bot uses Retrieval Augmented Generation (RAG) to converse with the user about the data in the collection */
    ai?: {
        /** Set to `true` to save embeddings for records in this collection. Requires the `custom.setEmbedding` hook */
        embedding?: boolean
        chat?: {
            /** The name for the chat bot */
            name: string
            /** The number of records the LLM should retrieve for context */
            defaultQueryLimit?: number
            /** The roles that can view the chat bot. Warning: Only assign AI chat access to roles that have access to ALL fields used to calculate embeddings */
            roles: StokerRole[]
        }
    }
    /** The priority of this collection when seeding test data using `stoker seed-data` */
    seedOrder?: number

    /** Custom code config for the collection, including hooks and server access control */
    custom?: CollectionCustom
    /** Admin UI config for the collection */
    admin?: CollectionAdmin
}

export interface CollectionsConfig {
    roles: StokerRole[]
    permissionsIndexExemption: boolean
    writeLogIndexExemption?: string[]
    writeLogTTL?: number
}

export interface CollectionsSchema {
    collections: {
        [key: string]: CollectionSchema
    }
    config: CollectionsConfig
    published_time: number | object
    version: number
}

export interface GenerateSchemaParams {
    sdk: "web" | "node"
    utils?: WebUtilities | NodeUtilities
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any
}
export type GenerateSchema = (params: GenerateSchemaParams) => CollectionSchema

export interface RoleGroup {
    key: string
    roles: StokerRole[]
    fields: CollectionField[]
}

export interface WriteLogEntry {
    operation: "create" | "update" | "delete"
    collection: string
    docId: string
    user: string
    status: "started" | "written" | "success" | "failed" | "verified"
    Collection_Path: string[]
    Last_Write_At: Timestamp | FieldValue
    Last_Save_At?: Timestamp | FieldValue
    Last_Write_By: string
    Last_Write_Connection_Status: "Online" | "Offline"
    Last_Write_App: string
    Last_Write_Version: number
    TTL?: Timestamp | FieldValue
    data: {
        data?: Partial<StokerRecord>
        originalRecord?: StokerRecord
        finalRecord?: StokerRecord
        finalOriginal?: StokerRecord
        error?: unknown
    }
}

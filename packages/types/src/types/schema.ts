import { FieldValue } from "firebase-admin/firestore"
import { Timestamp, WhereFilterOp, WriteBatch } from "firebase/firestore"
import { NodeUtilities, WebUtilities } from "./app"
import { CalendarOptions } from "@fullcalendar/core"
import { SearchResult } from "minisearch"

export type StokerRole = string
export type StokerCollection = string

export type FirebaseTimestamp = Timestamp | FieldValue

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface StokerRelation {
    Collection_Path: string[]
    [key: string]: any
}

export interface StokerRelationObject {
    [id: string]: StokerRelation
}
export type StokerRelationArray = string[]

export interface StokerRecord {
    Collection_Path: string[]
    Last_Write_At: Timestamp | FieldValue
    Last_Save_At: Timestamp | FieldValue
    Last_Write_By: string
    Last_Write_App: string
    Last_Write_Connection_Status: "Online" | "Offline"
    Last_Write_Version: number
    Created_At: Timestamp | FieldValue
    Saved_At: Timestamp | FieldValue
    Created_By: string
    [key: string]: any
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface CollectionPermissions {
    auth?: boolean
    operations: ("Read" | "Create" | "Update" | "Delete")[]
    recordOwner?: {
        active: boolean
    }
    recordUser?: {
        active: boolean
    }
    recordProperty?: {
        active: boolean
    }
    restrictEntities?: boolean
    individualEntities?: string[]
    parentEntities?: string[]
    parentPropertyEntities?: Record<string, string[]>
}

export interface StokerPermissions {
    Tenant_ID?: string
    User_ID?: string
    Doc_ID?: string
    Collection?: StokerCollection
    Role?: StokerRole
    Enabled?: boolean
    collections?: {
        [collection: string]: CollectionPermissions
    }
}

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

export interface CollectionLabels {
    collection: string
    record: string
}

export type OperationType = "Read" | "Create" | "Update" | "Delete"
export type OperationTypeLower = "read" | "create" | "update" | "delete"

export interface PermissionWriteCollection {
    collection: StokerCollection
    operations: OperationType[]
    attributeRestrictions?: AttributeRestriction["type"][]
    restrictEntities?: boolean
    auth?: boolean
}

export interface PermissionWriteRestriction {
    userRole: StokerRole
    recordRole: StokerRole
    collections: PermissionWriteCollection[]
}

export interface AttributeRestrictionRole {
    role: StokerRole
    assignable?: boolean
    values?: string[]
}
export interface EntityRestrictionRole {
    role: StokerRole
}

export type AccessRole = AttributeRestrictionRole | EntityRestrictionRole

export interface IndividualEntityRestriction {
    type: "Individual"
    roles: EntityRestrictionRole[]
    singleQuery?: number
}
export interface ParentEntityRestriction {
    type: "Parent"
    roles: EntityRestrictionRole[]
    collectionField: string
    singleQuery?: number
}
export interface ParentPropertyEntityRestriction {
    type: "Parent_Property"
    roles: EntityRestrictionRole[]
    collectionField: string
    propertyField: string
}
export type AttributeRestriction = RecordUserRestriction | RecordOwnerRestriction | RecordPropertyRestriction

export interface RecordUserRestriction {
    type: "Record_User"
    roles: AttributeRestrictionRole[]
    collectionField: string
    operations?: ("Read" | "Create" | "Update" | "Delete")[]
}
export interface RecordOwnerRestriction {
    type: "Record_Owner"
    roles: AttributeRestrictionRole[]
    operations?: ("Read" | "Create" | "Update" | "Delete")[]
}
export interface RecordPropertyRestriction {
    type: "Record_Property"
    roles: AttributeRestrictionRole[]
    propertyField: string
    operations?: ("Read" | "Create" | "Update" | "Delete")[]
}

export type EntityRestriction = IndividualEntityRestriction | ParentEntityRestriction | ParentPropertyEntityRestriction
export type AccessRestriction = AttributeRestriction | EntityRestriction

export interface IndividualEntityParentFilter {
    type: "Individual"
    collectionField: string
    roles: EntityRestrictionRole[]
}
export interface ParentEntityParentFilter {
    type: "Parent"
    collectionField: string
    parentCollectionField: string
    roles: EntityRestrictionRole[]
}
export interface ParentPropertyEntityParentFilter {
    type: "Parent_Property"
    collectionField: string
    parentCollectionField: string
    parentPropertyField: string
    roles: EntityRestrictionRole[]
}
export type EntityParentFilter =
    | IndividualEntityParentFilter
    | ParentEntityParentFilter
    | ParentPropertyEntityParentFilter

export interface AccessOperations {
    assignable?: boolean | StokerRole[]
    read?: StokerRole[]
    create?: StokerRole[]
    update?: StokerRole[]
    delete?: StokerRole[]
}

export interface AccessFilesAssignmentRoles {
    read?: StokerRole[]
    update?: StokerRole[]
    delete?: StokerRole[]
}
export interface AccessFilesAssignment {
    optional?: AccessFilesAssignmentRoles
    required?: AccessFilesAssignmentRoles
}
export interface AccessFiles {
    assignment?: {
        [role: StokerRole]: AccessFilesAssignment
    }
    metadata?: {
        [key: string]: string
    }
    customMetadata?: {
        [key: string]: string
    }
}

export interface EntityRestrictions {
    assignable?: StokerRole[]
    restrictions?: EntityRestriction[]
    parentFilters?: EntityParentFilter[]
}
export interface CollectionAccess {
    serverReadOnly?: StokerRole[]
    serverWriteOnly?: boolean
    customSecurityRules?: boolean
    customStorageRules?: boolean
    attributeRestrictions?: AttributeRestriction[]
    entityRestrictions?: EntityRestrictions
    permissionWriteRestrictions?: PermissionWriteRestriction[]
    operations: AccessOperations
    auth?: StokerRole[]
    files?: AccessFiles
}

export type PreOperationHookArgs = [
    operation: "read" | "create" | "update" | "delete",
    data?: StokerRecord,
    docId?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
    batch?: WriteBatch,
    originalRecord?: StokerRecord,
]
export type PreReadHookArgs = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    refs: unknown[],
    multiple?: boolean,
    listener?: boolean,
]
export type PostReadHookArgs = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    refs: unknown[],
    doc: StokerRecord | undefined,
    listener?: boolean,
]
export type PreDuplicateHookArgs = [data: Partial<StokerRecord>]
export type PreValidateHookArgs = [
    operation: "create" | "update",
    record: StokerRecord,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    batch?: WriteBatch,
    originalRecord?: StokerRecord,
]
export type PreWriteHookArgs = [
    operation: "create" | "update" | "delete",
    data: StokerRecord,
    docId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    batch?: WriteBatch,
    originalRecord?: StokerRecord,
]
export type PostWriteHookArgs = [
    operation: "create" | "update" | "delete",
    data: StokerRecord,
    docId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    retry?: boolean,
    originalRecord?: StokerRecord,
]
export type PostWriteErrorHookArgs = [
    operation: "create" | "update" | "delete",
    data: StokerRecord,
    docId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    error: unknown,
    retry?: boolean,
    retries?: number,
    originalRecord?: StokerRecord,
]
export type PostOperationHookArgs = [
    operation: "read" | "create" | "update" | "delete",
    data?: StokerRecord,
    docId?: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
    retry?: boolean,
    originalRecord?: StokerRecord,
]

export type FilePermissions = {
    read?: string
    update?: string
    delete?: string
}

export type PreFileAddHookArgs = [
    record: StokerRecord,
    fullPath: string,
    filename: string,
    permissions: FilePermissions,
]

export type PreFileUpdateHookArgs = [
    record: StokerRecord,
    update:
        | { type: "rename"; oldPath: string; newPath: string }
        | {
              type: "permissions"
              path: string
              originalPermissions: FilePermissions
              permissions: FilePermissions
          },
]

export type PostFileAddHookArgs = [
    record: StokerRecord,
    fullPath: string,
    filename: string,
    permissions: FilePermissions,
]

export type PostFileUpdateHookArgs = [
    record: StokerRecord,
    update:
        | { type: "rename"; oldPath: string; newPath: string }
        | {
              type: "permissions"
              path: string
              originalPermissions: FilePermissions
              permissions: FilePermissions
          },
]

export type SetEmbeddingHookArgs = [record: StokerRecord]

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
    | PostFileUpdateHookArgs
    | SetEmbeddingHookArgs

export type PreOperationHook = (...args: PreOperationHookArgs) => boolean | void | Promise<boolean | void>
export type PreReadHook = (...args: PreReadHookArgs) => void | Promise<void>
export type PostReadHook = (...args: PostReadHookArgs) => void | Promise<void>
export type PreDuplicateHook = (...args: PreDuplicateHookArgs) => boolean | void | Promise<boolean | void>
export type PreValidateHook = (
    ...args: PreValidateHookArgs
) => { valid: boolean; message?: string } | Promise<{ valid: boolean; message?: string }>
export type PreWriteHook = (...args: PreWriteHookArgs) => boolean | void | Promise<boolean | void>
export type PostWriteHook = (...args: PostWriteHookArgs) => boolean | void | Promise<boolean | void>
export type PostWriteErrorHook = (...args: PostWriteErrorHookArgs) => boolean | void | Promise<boolean | void>
export type PostOperationHook = (...args: PostOperationHookArgs) => boolean | void | Promise<boolean | void>

export type PreFileAddHook = (...args: PreFileAddHookArgs) => boolean | void | Promise<boolean | void>
export type PreFileUpdateHook = (...args: PreFileUpdateHookArgs) => boolean | void | Promise<boolean | void>
export type PostFileAddHook = (...args: PostFileAddHookArgs) => boolean | void | Promise<boolean | void>
export type PostFileUpdateHook = (...args: PostFileUpdateHookArgs) => boolean | void | Promise<boolean | void>

export type SetEmbeddingHook = (...args: SetEmbeddingHookArgs) => string | Promise<string>

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
    | PostFileUpdateHook
    | SetEmbeddingHook

export type Hooks = {
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
    setEmbedding?: SetEmbeddingHook
}

export interface PreloadCacheRange {
    fields: string[]
    ranges?: [string, string][]
    labels?: string[]
    start: "Today" | "Week" | "Month" | "Year" | Date | number
    startOffsetDays?: number
    startOffsetHours?: number
    end?: Date | number
    endOffsetDays?: number
    endOffsetHours?: number
    selector?: "range" | "week" | "month" | ("range" | "week" | "month")[]
}

export interface PreloadCache {
    roles: StokerRole[]
    relationCollections?: boolean | (() => boolean | Promise<boolean>)
    range?: PreloadCacheRange
    constraints?:
        | [string, WhereFilterOp, unknown][]
        | (() => [string, WhereFilterOp, unknown][] | Promise<[string, WhereFilterOp, unknown][]>)
}

export interface PreloadCacheInitial {
    [collection: string]: {
        roles: StokerRole[]
        range?: PreloadCacheRange
        constraints?: [string, WhereFilterOp, unknown][]
        orQueries?: [string, WhereFilterOp, unknown][]
    }
}

export interface CollectionCustom extends Hooks {
    serverAccess?: {
        read?: (role: StokerRole, record?: StokerRecord) => boolean | Promise<boolean>
        create?: (role: StokerRole, record: StokerRecord) => boolean | Promise<boolean>
        update?: (role: StokerRole, record: StokerRecord, originalRecord?: StokerRecord) => boolean | Promise<boolean>
        delete?: (role: StokerRole, record: StokerRecord) => boolean | Promise<boolean>
    }
    preloadCacheConstraints?:
        | [string, WhereFilterOp, unknown][]
        | (() => [string, WhereFilterOp, unknown][] | Promise<[string, WhereFilterOp, unknown][]>)
    preloadCacheOrQueries?:
        | [string, WhereFilterOp, unknown][]
        | (() => [string, WhereFilterOp, unknown][] | Promise<[string, WhereFilterOp, unknown][]>)
    autoCorrectUnique?: boolean | (() => boolean | Promise<boolean>)
    disableOfflineCreate?: boolean | (() => boolean | Promise<boolean>)
    disableOfflineUpdate?: boolean | (() => boolean | Promise<boolean>)
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ListConfig {
    title?: string
}

export interface CardsConfig {
    roles?: StokerRole[]
    statusField?: string
    excludeValues?: string[] | number[]
    headerField: string
    maxHeaderLines?: 1 | 2
    sections: {
        title?: string
        fields: string[]
        blocks?: boolean
        large?: boolean
        maxSectionLines?: 1 | 2 | 3 | 4
        collapse?: "sm" | "md" | "lg" | "xl" | "2xl" | ((record?: StokerRecord) => "sm" | "md" | "lg" | "xl" | "2xl")
    }[]
    footerField?: string
    maxFooterLines?: 1 | 2
    title?: string
    cardClass?: string
}

export interface ImagesConfig {
    roles?: StokerRole[]
    imageField: string
    size: "sm" | "md" | "lg"
    maxHeaderLines?: 1 | 2
    title?: string
}

export interface MapConfig {
    roles?: StokerRole[]
    coordinatesField?: string
    addressField?: string
    center: {
        lat: number
        lng: number
    }
    zoom: number
    noLocation?: {
        title: string
    }
    title?: string
}

export interface CalendarConfig {
    roles?: StokerRole[]
    startField: string
    endField?: string
    allDayField?: string
    fullCalendarLarge?: CalendarOptions
    fullCalendarSmall?: CalendarOptions
    resourceField?: string
    resourceTitleField?: string
    unscheduled?: {
        title: string
        roles?: StokerRole[]
    }
    title?: string
    dataStart?: { days: number } | { weeks: number } | { months: number } | { years: number }
    dataEnd?: { days: number } | { weeks: number } | { months: number } | { years: number }
    dataStartOffset?: { days: number } | { weeks: number } | { months: number } | { years: number }
    dataEndOffset?: { days: number } | { weeks: number } | { months: number } | { years: number }
    color?: string | ((record: StokerRecord) => string)
}

export type StatusFilter = {
    type: "status"
    value?: string | number
    roles?: StokerRole[]
}

export type RangeFilter = {
    type: "range"
    field: string
    selector?:
        | "range"
        | "week"
        | "month"
        | ("range" | "week" | "month")[]
        | (() => "range" | "week" | "month" | ("range" | "week" | "month")[])
    value?: string
    startOffsetDays?: number
    startOffsetHours?: number
    endOffsetDays?: number
    endOffsetHours?: number
}

export type SelectFilter = {
    type: "select"
    field: string
    title?: string | (() => string)
    roles?: StokerRole[]
    condition?: (value: boolean | string | number | undefined) => boolean
    value?: string | number
    style?: "select" | "radio" | "buttons"
}

export type RelationFilter = {
    type: "relation"
    field: string
    title?: string | (() => string)
    roles?: StokerRole[]
    constraints?: [string, "==" | "in", unknown][]
    value?: string
}

export type Filter = StatusFilter | RangeFilter | SelectFilter | RelationFilter

export interface Metric {
    type: "sum" | "average" | "count"
    field?: string
    roles?: StokerRole[]
    title?: string
    decimal?: number
    prefix?: string
    suffix?: string
    textSize?: "text-xl" | "text-2xl" | "text-3xl"
}
export interface Chart {
    type: "area"
    dateField: string
    metricField1?: string
    metricField2?: string
    defaultRange: "90d" | "30d" | "7d"
    roles?: StokerRole[]
    title?: string
}
export interface CollectionMeta {
    title?: string
    description?: string
}
export interface RowHighlight {
    condition: (record: StokerRecord) => boolean
    className: string
    roles?: StokerRole[]
}
export interface Convert {
    collection: string
    convert: (record: StokerRecord) => Partial<StokerRecord> | Promise<Partial<StokerRecord>>
    roles?: StokerRole[]
}
export interface CustomField {
    position?: number | ((record?: StokerRecord) => number)
    component?: React.FC
    props?: Record<string, unknown>
    condition?: (operation: "create" | "update" | "update-many", record?: StokerRecord) => boolean
}
export interface FormList {
    collection: StokerCollection
    fields: string[]
    sortField?: string
    sortDirection?: "asc" | "desc"
    label?: string
}

export interface FormButton {
    title: string
    icon?: React.FC<{ className?: string }>
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    action: (
        operation: "create" | "update" | "update-many",
        formValues: StokerRecord,
        originalRecord?: StokerRecord,
    ) => void | Promise<void>
    condition?: boolean | ((operation: "create" | "update" | "update-many", record?: StokerRecord) => boolean)
    setIsLoading?: (isLoading: boolean) => void
}

export interface CustomRecordPage {
    title: string
    url: string
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
    condition?: (record: StokerRecord | undefined) => boolean
    icon?: React.FC<{ className?: string }>
}
export interface CollectionAdmin {
    hidden?: boolean | (() => boolean | Promise<boolean>)
    navbarPosition?: number | (() => number)
    titles?:
        | {
              collection: string
              record: string
          }
        | (() => { collection: string; record: string } | Promise<{ collection: string; record: string }>)
    icon?: React.FC | (() => React.FC | Promise<React.FC>)
    duplicate?: boolean | (() => boolean | Promise<boolean>)
    convert?: Convert[] | (() => Convert[] | Promise<Convert[]>)
    live?: boolean | (() => boolean | Promise<boolean>)
    statusField?: {
        field: string
        active?: unknown[]
        archived?: unknown[]
    }
    defaultRoute?: string | (() => string)
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
    itemsPerPage?: number | (() => number | Promise<number>)
    list?: ListConfig | (() => ListConfig | Promise<ListConfig>)
    cards?: CardsConfig | (() => CardsConfig | Promise<CardsConfig>)
    images?: ImagesConfig | (() => ImagesConfig | Promise<ImagesConfig>)
    map?: MapConfig | (() => MapConfig | Promise<MapConfig>)
    calendar?: CalendarConfig | (() => CalendarConfig | Promise<CalendarConfig>)
    filters?: Filter[]
    rangeSelectorValues?:
        | "range"
        | "week"
        | "month"
        | ("range" | "week" | "month")[]
        | (() => "range" | "week" | "month" | ("range" | "week" | "month")[])
    defaultRangeSelector?: "range" | "week" | "month" | (() => "range" | "week" | "month")
    restrictExport?: StokerRole[] | (() => StokerRole[] | Promise<StokerRole[]>)
    metrics?: (Metric | Chart)[] | (() => (Metric | Chart)[] | Promise<(Metric | Chart)[]>)
    meta?: CollectionMeta | (() => CollectionMeta | Promise<CollectionMeta>)
    rowHighlight?: RowHighlight[] | (() => RowHighlight[])
    breadcrumbs?: string[] | (() => string[] | Promise<string[]>)
    customFields?: CustomField[] | (() => CustomField[] | Promise<CustomField[]>)
    customRecordPages?: CustomRecordPage[] | (() => CustomRecordPage[] | Promise<CustomRecordPage[]>)
    formButtons?: FormButton[] | (() => FormButton[] | Promise<FormButton[]>)
    formUpload?: boolean | (() => boolean | Promise<boolean>)
    formImages?: boolean | (() => boolean | Promise<boolean>)
    formLists?: FormList[] | (() => FormList[] | Promise<FormList[]>)
    hideCreate?: boolean | ((relationList?: StokerCollection) => boolean | Promise<boolean>)
    disableUpdate?: boolean | ((operation: "create" | "update", record: StokerRecord) => boolean | Promise<boolean>)
    onFormOpen?: (operation: "create" | "update", record: StokerRecord) => void | Promise<void>
    onChange?: (
        operation: "create" | "update",
        record: StokerRecord,
        originalRecord: StokerRecord,
    ) => Partial<StokerRecord> | void | Promise<Partial<StokerRecord> | void>
    addRecordButtonOverride?: (record?: StokerRecord) => void | Promise<void>
    disableRangeSelector?: boolean | (() => boolean)
}
export interface CollectionAdminCache {
    navbarPosition?: number
    titles?: {
        collection: string
        record: string
    }
    icon?: React.FC
    duplicate?: boolean
    live?: boolean
    statusField?: {
        field: string
        active?: unknown[]
        archived?: unknown[]
    }
    defaultSort?: {
        field: string
        direction?: "asc" | "desc"
    }
    itemsPerPage?: number
    list?: ListConfig
    cards?: CardsConfig
    images?: ImagesConfig
    map?: MapConfig
    calendar?: CalendarConfig
    filters?: Filter[]
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
    hideCreate?: boolean
}

export interface FieldCustom extends Hooks {
    initialValue?: unknown | ((record?: StokerRecord) => unknown | Promise<unknown>)
    serverAccess?: {
        read?: (role: StokerRole, record?: StokerRecord) => boolean | Promise<boolean>
        create?: (role: StokerRole, record: StokerRecord) => boolean | Promise<boolean>
        update?: (role: StokerRole, record: StokerRecord, originalRecord?: StokerRecord) => boolean | Promise<boolean>
    }
}

export interface FieldDescription {
    message: string | ((record?: StokerRecord) => string | Promise<string>)
    condition?: boolean | ((record?: StokerRecord) => boolean | Promise<boolean>)
}

export interface LocationFieldAdmin {
    center: {
        lat: number
        lng: number
    }
    zoom: number
}

export interface FormFieldIcon {
    component: React.FC
    className?: string
}

export interface FieldAdmin {
    label?: string | (() => string)
    listLabel?: string | (() => string)
    icon?: FormFieldIcon | (() => FormFieldIcon | Promise<FormFieldIcon>)
    condition?: {
        list?: boolean | ((parentCollection?: CollectionSchema, parentRecord?: StokerRecord) => boolean)
        form?: boolean | ((operation?: "create" | "update", record?: StokerRecord) => boolean)
    }
    readOnly?: boolean | ((operation?: "create" | "update", record?: StokerRecord) => boolean | Promise<boolean>)
    description?: FieldDescription
    textarea?: boolean | (() => boolean | Promise<boolean>)
    radio?: boolean | (() => boolean | Promise<boolean>)
    switch?: boolean | (() => boolean | Promise<boolean>)
    time?: boolean | (() => boolean | Promise<boolean>)
    slider?: boolean | (() => boolean | Promise<boolean>)
    richText?: boolean | (() => boolean | Promise<boolean>)
    location?: LocationFieldAdmin | (() => LocationFieldAdmin | Promise<LocationFieldAdmin>)
    image?: boolean | (() => boolean)
    tags?: string[] | (() => string[])
    live?: boolean | (() => boolean | Promise<boolean>)
    column?: boolean | number | (() => boolean | number)
    badge?: boolean | string | ((record?: StokerRecord) => boolean | string)
    hidden?: "sm" | "md" | "lg" | "xl" | "2xl" | ((record?: StokerRecord) => "sm" | "md" | "lg" | "xl" | "2xl")
    italic?: boolean | ((record?: StokerRecord) => boolean)
    currency?: string | ((record?: StokerRecord) => string)
    sort?: (record?: StokerRecord) => unknown
    noExport?: boolean | (() => boolean)
    exportSeparator?: string | (() => string)
    skipFormRequiredValidation?: boolean | (() => boolean)
    overrideFormRequiredValidation?: (operation: "create" | "update", record?: StokerRecord) => boolean
    filterValues?: (value: string | number, parentCollection: CollectionSchema, parentRecord?: StokerRecord) => boolean
    filterResults?: (result: SearchResult, parentCollection: CollectionSchema, parentRecord?: StokerRecord) => boolean
    modifyResultTitle?: (
        record: StokerRecord,
        parentCollection: CollectionSchema,
        parentRecord?: StokerRecord,
    ) => string
    modifyDisplayValue?: (record?: StokerRecord, context?: "card" | "form" | "list") => unknown
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
}

export interface DependencyField {
    field: string
    roles: StokerRole[]
}
export interface EnforceHierarchy {
    field: string
    recordLinkField: string
}
export interface SingleFieldExemption {
    queryScope: "COLLECTION" | "COLLECTION_GROUP"
    order?: "ASCENDING" | "DESCENDING"
    arrayConfig?: "CONTAINS" | "CONTAINS_ANY"
}

export interface StandardField {
    name: string
    description?: string | (() => string | Promise<string>)

    singleFieldExemption?: SingleFieldExemption[] | boolean
    sorting?:
        | boolean
        | {
              direction?: "asc" | "desc"
              roles?: StokerRole[]
          }

    required?: boolean
    nullable?: boolean

    access?: StokerRole[]
    restrictCreate?: StokerRole[] | boolean
    restrictUpdate?: StokerRole[] | boolean
    skipRulesValidation?: boolean

    custom?: FieldCustom
    admin?: FieldAdmin
}
export interface BooleanField extends StandardField {
    type: "Boolean"
}
export interface StringField extends StandardField {
    type: "String"
    values?: string[]
    unique?: boolean

    length?: number
    minlength?: number
    maxlength?: number
    pattern?: string

    email?: boolean
    url?: boolean
    emoji?: boolean
    uuid?: boolean
    ip?: boolean
}
export interface NumberField extends StandardField {
    type: "Number"
    values?: number[]
    unique?: boolean

    autoIncrement?: boolean
    decimal?: number

    max?: number
    min?: number
}
export interface TimestampField extends StandardField {
    type: "Timestamp"
    values?: number[]

    max?: number
    min?: number
}
export interface ArrayField extends StandardField {
    type: "Array"
    values?: string[]

    length?: number
    minlength?: number
    maxlength?: number
}
export interface MapField extends StandardField {
    type: "Map"
}
export interface RelationField extends StandardField {
    type: "OneToOne" | "OneToMany" | "ManyToOne" | "ManyToMany"
    collection: StokerCollection
    twoWay?: string
    includeFields?: string[]
    titleField?: string
    preserve?: boolean
    writeAny?: boolean
    dependencyFields?: DependencyField[]
    enforceHierarchy?: EnforceHierarchy
    min?: number
    max?: number
    length?: number
    constraints?: [string, "==" | "in", unknown][]
}
export interface EmbeddingField extends StandardField {
    type: "Embedding"
}
export interface ComputedField extends StandardField {
    type: "Computed"
    formula: (record: StokerRecord) => string | number | Promise<string | number>
}
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

export interface RoleSystemField {
    field: string
    roles?: StokerRole[]
}

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

export interface Query {
    field: string
    range?: boolean
    standalone?: boolean
    roles?: StokerRole[]
}

export interface RelationList {
    collection: StokerCollection
    field: string
    roles?: StokerRole[]
}

export interface CollectionSchema {
    labels: CollectionLabels
    access: CollectionAccess
    fields: (CollectionField | RelationField)[]
    recordTitleField: string

    auth?: boolean
    singleton?: boolean
    parentCollection?: StokerCollection

    preloadCache?: PreloadCache
    softDelete?: {
        archivedField: string
        timestampField: string
        retentionPeriod: number
    }

    queries?: Query[]
    relationLists?: RelationList[]
    allowSchemalessFields?: boolean
    enableWriteLog?: boolean
    fullTextSearch?: string[]
    searchOptions?: Record<string, unknown>
    ttl?: string
    indexExemption?: boolean
    roleSystemFields?: RoleSystemField[]
    skipRulesValidation?: boolean
    ai?: {
        embedding?: boolean
        chat?: {
            name: string
            defaultQueryLimit?: number
            roles: StokerRole[]
        }
    }
    seedOrder?: number

    custom?: CollectionCustom
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

export type GenerateSchema = (
    sdk: "web" | "node",
    config?: WebUtilities | NodeUtilities,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
) => CollectionSchema

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

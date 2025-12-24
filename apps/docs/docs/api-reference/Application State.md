---
sidebar_position: 4
---

You have access to application state while working in the global config file and collection config files.

The global config file works by exporting a `GenerateGlobalConfig` function. Collection config files export a `GenerateSchema` function. 

Below are the parameters available to these functions.

You can also use the [Web](/docs/api-reference/Web%20SDK) and [Node](/docs/api-reference/Node%20SDK) SDKs in your config files.

## sdk

`"web" | "node"`

The first parameter is the `sdk` that is currently in use. This signals which environment your app is currently running in.

## utils (web)

The second argument is a `utils` object that contains the following helper functions when running in the `web` sdk:

### getTenant

`() => string`

Returns the tenant ID for the currently active tenant.

### getEnv

`() => Record<string, string>`

Returns the .env config for the project. The env vars available are listed in the project's `.env.<PROJECT_NAME>` file in the `env` directory.

### getTimezone

`() => string`

Returns the timezone for the app, as defined in `src/main.ts`.

### getConnectionStatus

`() => "Online" | "Offline"`

Returns app's the current Firebase connection status.

### getNetworkStatus

`() => "Online" | "Offline"`

Returns app's the current network connection status.

### getSchema

`(includeComputedFields?: boolean) => CollectionsSchema`

Returns the app's schema.

Set `includeComputedFields` to `true` to include computed fields in the schema.

### getCurrentUser

`() => User & { token: { claims: ParsedToken } }`

Returns the currently logged in [Firebase User](https://firebase.google.com/docs/reference/js/auth.user) along with the user's custom claims, such as `role`.

### getGlobalConfigModule

`() => GlobalConfig`

Returns the app's global config.

### getCollectionConfigModule

`(collection: string) => CollectionCustomization`

Return's a collection's config. Use this to access the `custom` and `admin` properties for a collection. All other properties are serializable and can be accessed in `getSchema().collections[COLLECTION_NAME]`

### getVersionInfo

```
type VersionInfo = {
    version: number
    force: boolean
    refresh: boolean
    time: Timestamp | FieldValue
    payload: unknown
}
```

`() => VersionInfo | undefined`

Returns information about the app's current schema version.

### getMaintenanceInfo

`() => { active: boolean } | undefined`

Returns the app's current maintenance mode status.

### getCurrentUserPermissions

`() => StokerPermissions | null`

Returns the currently logged in user's permissions.

### getLoadingState

`() => { [collection: string]: "Loading" | "Loaded" | "Error" }`

Returns the loading state for collections with the [preload cache](/docs/api-reference/Collection%20Config%20Files#preload-cache-config) enabled.

### getAppCheck

`() => AppCheck`

Returns the app's main App Check instance.

### getAppCheckFirestoreWrite

`() => AppCheck`

Returns the app's write App Check instance.

Only relevant when `auth.offlinePersistenceType` is set to `"ALL"` or `"WRITE"`

### getFirestoreWriteAuth

`() => Auth`

Returns the app's write Auth instance.

Only relevant when `auth.offlinePersistenceType` is set to `"ALL"` or `"WRITE"`

### getFirestoreWrite

`() => Firestore`

Returns the app's write Firestore instance.

Only relevant when `auth.offlinePersistenceType` is set to `"ALL"` or `"WRITE"`

### getFirestoreMaintenance

`() => Firestore`

Returns the app's maintnenance Firestore instance.

## utils (node)

The second argument is a `utils` object that contains the following helper functions when running in the `node` sdk:

### getMode

`() => "development" | "production"`

Return the environment that the app is currently running in.

### getTenant

`() => string`

Returns the tenant ID for the currently active tenant.

### getTimezone

`() => string`

Returns the timezone for the app, as defined in `src/main.ts`.

### getGlobalConfigModule

`() => GlobalConfig`

Returns the app's global config.

### getCustomizationFile

`(collection: string, schema: CollectionsSchema) => CollectionCustomization`

Return's a collection's config. Use this to access the `custom` and `admin` properties for a collection.

### getVersionInfo

```
type VersionInfo = {
    version: number
    force: boolean
    refresh: boolean
    time: Timestamp | FieldValue
    payload: unknown
}
```

`() => VersionInfo | undefined`

Returns information about the app's current schema version.

### getMaintenanceInfo

`() => { active: boolean } | undefined`

Returns the app's current maintenance mode status.

## context (web sdk only)

The third argument is a `context` object that returns the context provided to `initializeStoker`. The defaults provided when using the Admin UI are:

### setMaintenance

`(maintenance: boolean) => void`

Toggle the app's maintenance mode status.

### setConnectionStatus

`(connectionStatus: "online" | "offline") => void`

Toggle the app's network connection status.

### setDialogContent

Show a dialog.

`(dialogContent: DialogContent | null) => void`

```
type DialogContent = {
    title: string
    description: string
    disableClose?: boolean
    buttons?: {
        label: string
        onClick: () => void | Promise<void>
    }[]
}
```

### setGlobalLoading

`(operation: "+" | "-", id: string) => void`

Signal to the app that a record is pending and show the global loading spinner.

`operation`: Use "+" to signal pending state, and "-" to remove it.

`id`: The id of the record.

### createRecordForm

Show the create record form for a collection.

```
(
    collection: CollectionSchema,
    collectionPath: string[],
    record?: StokerRecord,
) => false | React.ReactPortal
```

`collection`: The schema for the collection.

`collectionPath`: The path to the record's collection, for example `["Clients"]`

`record`: Data that will be used to pre-fill the form.



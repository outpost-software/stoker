---
sidebar_position: 7
---

Stoker provides a Node SDK that can be used to work with your app.

The Stoker CLI uses this SDK under the hood.

## Installation

`npm i @stoker-platform/node-client`

## initializeStoker

Initialize a Stoker app.

```
(
    modeEnv: "development" | "production",
    configFilePath: string,
    customizationFilesPath: string,
    gcp?: boolean
) => Promise<NodeUtilities>
```

#### Parameters

`modeEnv`: The environment to start the app in.

`configFilePath`: The path to you global config file. For example: `join(process.cwd(), "config", "main.js")`

`collectionFiles`: The path to your collection config files. For example: `join(process.cwd(), "config", "collections")`

`gcp`: Set to  `true` if the app will be running in Google Cloud Platform environment, such as a Cloud Function.

#### Returns

All [Node helper functions](/docs/api-reference/Application%20State#utils-node).

## fetchCurrentSchema

`(includeComputedFields?: boolean) => Promise<CollectionsSchema>`

Retrieve you app's schema. Set `includeComputedFields` to `true` to include computed fields.

## fetchLastSchema

`() => Promise<CollectionsSchema | undefined>`

Retrieve you app's previous schema.

## addRecord

```
(
    path: string[],
    data: Partial<StokerRecord>,
    user?: {
        password: string
        permissions?: StokerPermissions
    },
    userId?: string,
    options?: {
        noTwoWay?: boolean
        providedTransaction?: Transaction
        providedSchema?: CollectionsSchema
    },
    context?: any,
    id?: string,
) => Promise<StokerRecord>
```

#### Parameters

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record will be in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`data`: The record to save.

`user`: Optional user credentials, if this collection has `auth` enabled. Permissions must be provided in this structure:

```
type StokerPermissions = {
    Role?: string
    Enabled?: boolean
    collections?: {
        [collection: string]: {
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
    }
}
```

`userId`: A user to impersonate.

`options.noTwoWay`: Do not write two-way relations.

`options.providedTransaction`: Provide a Firestore transaction to be used for the operation. This allows batched writes, which is useful for data imports / migrations. There are some limitations:
- Unique field checks will not run. If you want unique field validation you'll have to do it manually.
- postWrite and postWriteError hooks will not fire.
- No write log entries will be created.
- Relation validation will not run.

`options.providedSchema`: Provide a Stoker schema when `options.providedTransaction` is in use. This will prevent the schema from being re-fetched for every write operation.

`context`: The context to pass to hooks.

`id`: Optionally provide a Firestore id for the new record.

#### Returns

The saved record.

## updateRecord

Update a record in the database.

You only need to provide the fields that you want to update.

To delete a field, provide a [Firestore delete sentinel](https://firebase.google.com/docs/firestore/manage-data/delete-data)

You can [transactionally increment or decrement a field value](https://firebase.google.com/docs/firestore/manage-data/add-data)

```
(
    path: string[],
    docId: string,
    data: Partial<StokerRecord>,
    user?: {
        operation: "create" | "update" | "delete"
        password?: string
        permissions?: StokerPermissions
    },
    userId?: string,
    options?: {
        noTwoWay?: boolean
        providedTransaction?: Transaction
        providedSchema?: CollectionsSchema
    },
    context?: any,
    originalRecord?: StokerRecord
) => Promise<StokerRecord>
```

#### Parameters

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`docId`: The id of the record to update.

`data`: The data to update.

`user`: Optional user credentials, if this collection has `auth` enabled. Permissions must be provided in the structure defined in `addRecord` above. Use `operation` to specify whether credentials should be added, updated or deleted.

`userId`: A user to impersonate.

`options.noTwoWay`: Do not write two-way relations.

`options.providedTransaction`: Provide a Firestore transaction to be used for the operation. This allows batched writes, which is useful for data imports / migrations. There are some limitations:
- Unique field checks will not run. If you want unique field validation you'll have to do it manually.
- postWrite and postWriteError hooks will not fire.
- No write log entries will be created.
- Relation validation will not run.
- You must provide a value for originalRecord (see below)

`options.providedSchema`: Provide a Stoker schema when `options.providedTransaction` is in use. This will prevent the schema from being re-fetched for every write operation.

`context`: The context to pass to hooks.

`originalRecord`: Optionally provide the entire original record for the record that is being modified. This will prevent the original record from being retrieved from Firestore, which improves performance when performing bulk write operations.

#### Returns

The updated record.

## deleteRecord

```
(
    path: string[],
    docId: string,
    userId?: string,
    options?: {
        force?: boolean;
    },
    context?: any
) => Promise<StokerRecord>
```

#### Parameters

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`docId`: The id of the record to delete.

`userId`: A user to impersonate.

`options`: Force deletion of records in collections with soft-delete enabled.

`context`: The context to pass to hooks.

#### Returns

The deleted record.

## getOne

Retrieve a record from the database.

```
(
    path: string[],
    docId: string,
    options?: {
        user?: string
        relations?: {
            fields?: (string | CollectionField)[]
            depth: number
        }
        subcollections?: {
            collections?: string[]
            depth: number
            constraints?: [string, string, unknown][]
            limit?: {
                number: number
                orderByField: string
                orderByDirection: "asc" | "desc"
            }
        }
        providedTransaction?: Transaction
        noComputedFields?: boolean
        noEmbeddingFields?: boolean
    }
) => Promise<StokerRecord>
```

#### Parameters

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`docId`: The id of the record to retrieve.

`options.user`: A user to impersonate.

`options.relations`: Include related records. Specify the depth to retrieve relations for. Optionally specify a subset of relation fields to retrieve.

`options.subcollections`: Include records from the record's subcollections. Specify the depth to retrieve subcollections for. Optionally specify a subset of subcollections to retrieve. Optionally provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to apply to subcollection queries. Optionally limit the number of results and specify results sorting.

`options.providedTransaction`: Provide a Firestore transaction to use for the operation.

`options.noComputedFields`: Exclude computed fields from the record.

`options.noEmbeddingFields`: Exclude embeddings fields from the record.

#### Returns

The record.

## getSome

Retrieve multiple records from the database.

```
(
    path: string[],
    constraints?: [string, string, unknown][],
    options?: {
        user?: string
        relations?: {
            fields?: (string | CollectionField)[]
            depth: number
        }
        subcollections?: {
            collections?: string[]
            depth: number
            constraints?: [string, string, unknown][]
            limit?: {
                number: number
                orderByField: string
                orderByDirection: "asc" | "desc"
            }
        }
        pagination?: {
            number: number
            orderByField?: string
            orderByDirection?: "asc" | "desc"
            startAfter?: Cursor
            endBefore?: Cursor
        }
        transactional?: boolean
        providedTransaction?: Transaction
        noEmbeddingFields?: boolean
        noComputedFields?: boolean
    }
) => Promise<{
    cursor: Cursor;
    pages: number;
    docs: StokerRecord[];
}>
```

#### Parameters

`path`: The path to the collection for the records i.e. `["Clients"]`. If the records are in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`constraints`: Provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to the query.

`options.user`: A user to impersonate.

`options.relations`: Include related records. Specify the depth to retrieve relations for. Optionally specify a subset of relation fields to retrieve.

`options.subcollections`: Include records from the record's subcollections. Specify the depth to retrieve subcollections for. Optionally specify a subset of subcollections to retrieve. Optionally provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to apply to subcollection queries. Optionally limit the number of results and specify results sorting.

`options.pagination`: Specify a number of results per page. Optionally enable sorting of results. Optionally provide a cursor object for `startAfter` or `endBefore`.

`options.transactional`: Set to `true` to include relation and subcollection documents in the main read transaction. Note that there is a limit of 500 read operations per transaction.

`options.providedTransaction`: Provide a Firestore transaction to use for the operation.

`options.noEmbeddingFields`: Exclude embeddings fields from the record.

`options.noComputedFields`: Exclude computed fields from the record.

#### Returns

`cursor`: A cursor object that can be passed to `startAfter` or `endBefore` in `options.pagination` above.

`pages`: The number of pages returned.

`docs`: The results of the query.

## sendMail

Send an email out of the system.

```
(
    to: string | string[],
    subject: string,
    text?: string,
    html?: string,
    cc?: string | string[],
    bcc?: string | string[],
    replyTo?: string,
    attachments?: {
        filename: string;
        content: Buffer;
        contentType: string;
    }[],
    from?: string
) => Promise<void>
```

## sendMessage

`(to: string, body: string) => Promise<void>`

Send an SMS out of the system. The `to` field must be a phone number starting with `+`.

## convertDataToTimezone

`(date: Date) => DateTime<true> | DateTime<false>`

Convert a JavaScript date to a [Luxon DateTime object](https://moment.github.io/luxon/api-docs/index.html#datetime) in you app's timezone.

## convertTimestampToTimezone

`(timestamp: Timestamp) => DateTime<true> | DateTime<false>`

Convert a [Firebase Timestamp](https://firebase.google.com/docs/reference/node/firebase.firestore.Timestamp) to a [Luxon DateTime object](https://moment.github.io/luxon/api-docs/index.html#datetime) in your app's timezone.

## keepTimezone

`(date: Date, timezone: string) => Date`

Set a Javascript date object to your app's timezone while keeping the current date and time.

## removeTimezone

`(date: Date, timezone: string) => Date`

Set a Javascript date object to the server's local timezone while keeping the current date and time.

## displayDate

`(timestamp: Timestamp | FieldValue) => string`

Display a [Firebase Timestamp](https://firebase.google.com/docs/reference/node/firebase.firestore.Timestamp) in the date format set in `src/main.ts`.

## tryPromise

`(configProperty: any, args?: unknown[]) => Promise<any>`

A utility to get a Stoker config value. Provide the raw config value to `configProperty`. If the value is a function or a promise, add arguments to `args`. Returns a promise with the config value.

## getCachedConfigValue

`(config: GlobalConfig | CollectionCustomization, pathArray: ConfigPath, args?: unknown[], overwrite?: boolean) => Promise<any>`

A utility to get a cached Stoker config value. Provide the config module to `config`. Provide a path to the config value, for example `["global", "auth", "enableMultiFactorAuth"]` or `["collections", COLLECTION_NAME, "admin", "itemsPerPage"]`. If the value is a function or a promise, provide an array of arguments to `args`. Set `overwrite` to `true` to ignore the currently cached value and re-generate the cached value.

## getSchema

`(operation: "create" | "update", collection: CollectionSchema, schema: CollectionsSchema) => ZodObject`

Retrieve the Zod schema for a collection. Provide the operation, the collection's schema and the full app schema.

## isDeleteSentinel

`isDeleteSentinel: (value: any) => any`

A helper to determine whether a value is a [Firestore delete sentinel](https://firebase.google.com/docs/firestore/manage-data/delete-data).
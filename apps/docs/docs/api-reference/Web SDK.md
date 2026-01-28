---
sidebar_position: 6
---

Stoker provides a Web SDK that can be used to work with your app.

The Admin UI uses this SDK under the hood.

## Installation

`npm i @stoker-platform/web-client`

## Utilities

All [web helper functions](/docs/api-reference/Application%20State#utils-web) are available in the Web SDK.

## initializeStoker

Initialize a Stoker app.

```
(
    config: any,
    collectionFiles: any,
    envVars: Record<string, string>,
    context?: any
) => Promise<boolean>
```

#### Parameters

`config`: Imported global config file. For example: `await import("config/main")`

`collectionFiles`: Imported collection config files. For example (Vite): `await import.meta.glob("config/collections/*", { eager: true })`

`envVars`: Env vars. For example (Vite): `import.meta.env`

`context`: State and helper functions that will be passed to the global and collection config files.

#### Returns

A boolean indicating whether a user is logged in.

## authenticateStoker

Authenticate a user.

```
(
    email: string,
    password: string,
    getMultiFactorTOTP?: () => Promise<string>
) => Promise<void>
```

`getMultiFactorTOTP`: A promise that will be fired when MFA is required. This promise should display an OTP field and return the users OTP (one-time-password).

## onStokerReady

`(callback: () => unknown) => () => void`

Fires when the user has successfully authenticated and Stoker is ready.

Returns a listener removal function.

## signOut

`() => Promise<void>`

Sign out the currently authenticated user.

## onStokerSignOut

`(callback: () => unknown) => () => void`

Fires when the user has successfully signed out.

Returns a listener removal function.

## onStokerPermissionsChange

`(callback: () => unknown) => () => void`

Fires when the currently authenticated user's permissions have changed.

Returns a listener removal function.

## multiFactorEnroll

Enroll the currently authenticated user in MFA.

```
(
    user: User,
    getMultiFactorCode: (secret: string, totpUri: string) => Promise<string>
) => Promise<void>
```

`user`: The Firebase user for the currently logged in user. Can be retrieved using `getCurrentUser`.

`getMultiFactorCode`: A promise that provides a secret and a TOTP URI and must return a OTP (one-time-password).

## addRecord

Add a record to the database.

```
(
    path: string[],
    data: Partial<StokerRecord>,
    user?: {
        password: string
        passwordConfirm: string
        permissions?: StokerPermissions
    },
    options?: {
        retry?: { type: string; docId: string }
    },
    id?: string,
    onValid?: () => void,
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

`options`: For internal use.

`id`: Optionally provide a Firestore id for the new record.

`onValid`: A callback that will fire when the record has passed validation.

#### Returns

The saved record.

## updateRecord

Update a record in the database.

You only need to provide the fields that you want to update.

To delete a field, provide a [Firestore delete sentinel](https://firebase.google.com/docs/firestore/manage-data/delete-data)

You can [transactionally increment or decrement a field value](https://firebase.google.com/docs/firestore/manage-data/add-data)

:::note
The `originalRecord` value provided to hooks in the Web SDK may be stale. If you need the latest value for `originalRecord`, you'll need to set [`access.serverReadOnly`](/docs/api-reference/Collection%20Config%20Files#serverreadonly).
:::

```
(
    path: string[],
    docId: string,
    data: Partial<StokerRecord>,
    user?: {
        operation: "create" | "update" | "delete"
        password?: string
        passwordConfirm?: string
        permissions?: StokerPermissions
    },
    options?: {
        retry?: { type: string; originalRecord: StokerRecord }
    },
    originalRecord?: StokerRecord,
) => Promise<StokerRecord>
```

#### Parameters

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`docId`: The id of the record to update.

`data`: The data to update.

`user`: Optional user credentials, if this collection has `auth` enabled. Permissions must be provided in the structure defined in `addRecord` above. Use `operation` to specify whether credentials should be added, updated or deleted.

`options`: For internal use.

`originalRecord`: Provide the existing record where applicable to improve performance. If this is not provided, the existing record will be retrieved from the database / cache.

#### Returns

The updated record.

## deleteRecord

Delete a record from the database.

```
(
    path: string[],
    docId: string,
    options?: { retry?: { type: string; record: StokerRecord } },
) => Promise<StokerRecord>
```

#### Parameters

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`docId`: The id of the record to delete.

`options`: For internal use.

#### Returns

The deleted record.

## getOne

Retrieve a record from the database.

```
(
    path: string[],
    docId: string,
    options?: {
        only?: "cache" | "server";
        relations?: {
            fields?: (string | CollectionField)[];
            depth: number;
        };
        subcollections?: {
            collections?: string[];
            depth: number;
            constraints?: QueryConstraint[];
            limit?: {
                number: number;
                orderByField: string;
                orderByDirection: "asc" | "desc";
            };
        };
        noComputedFields?: boolean;
        noEmbeddingFields?: boolean;
    }
) = Promise<StokerRecord>
```

#### Parameters

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`docId`: The id of the record to retrieve.

`options.only`: Only query the cache or the server.

`options.relations`: Include related records. Specify the depth to retrieve relations for. Optionally specify a subset of relation fields to retrieve.

`options.subcollections`: Include records from the record's subcollections. Optionally specify a subset of subcollections to retrieve. Optionally provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to apply to subcollection queries. Optionally limit the number of results and specify results sorting.

`options.noComputedFields`: Exclude computed fields from the record.

`options.noEmbeddingFields`: Exclude embeddings fields from the record.

#### Returns

The record.

## getSome

Retrieve multiple records from the database.

```
(
    path: string[],
    constraints?: QueryConstraint[] | [string, WhereFilterOp, unknown][],
    options?: 
        {
            only?: "cache" | "server"
            relations?: {
                fields?: (string | CollectionField)[]
                depth: number
            }
            subcollections?: {
                collections?: string[]
                depth: number
                constraints?: QueryConstraint[]
                limit?: {
                    number: number
                    orderByField: string
                    orderByDirection: "asc" | "desc"
                }
            }
            pagination?: {
                number: number
                orderByField?: string | FieldPath
                orderByDirection?: "asc" | "desc"
                startAfter?: Cursor
                endBefore?: Cursor
            }
            noEmbeddingFields?: boolean
            noComputedFields?: boolean
        }
) => Promise<{
    cursor: Cursor;
    pages: number | undefined;
    docs: StokerRecord[];
}>
```

#### Parameters

`path`: The path to the collection for the records i.e. `["Clients"]`. If the records are in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`constraints`: Provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to the query.

`options.only`: Only query the cache or the server.

`options.relations`: Include related records. Specify the depth to retrieve relations for. Optionally specify a subset of relation fields to retrieve.

`options.subcollections`: Include records from each record's subcollections. Optionally specify a subset of subcollections to retrieve. Optionally provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to apply to subcollection queries. Optionally limit the number of results and specify results sorting.

`options.pagination`: Specify a number of results per page. Optionally enable sorting of results. Optionally provide a cursor object for `startAfter` or `endBefore`.

`options.noComputedFields`: Exclude computed fields from the record.

`options.noEmbeddingFields`: Exclude embeddings fields from the record.

#### Returns

`cursor`: A cursor object that can be passed to `startAfter` or `endBefore` in `options.pagination` above.

`pages`: The number of pages returned.

`docs`: The results of the query.

## subscribeOne

Add a listener to a record in the database.

```
(
    path: string[],
    docId: string,
    callback: (docData: StokerRecord | undefined) => void,
    errorCallback?: (error: Error) => void,
    options?: {
        only?: "cache" | "default";
        relations?: boolean | {
            fields: (string | CollectionField)[];
        };
        noComputedFields?: boolean;
        noEmbeddingFields?: boolean;
    }
) => Promise<() => void>
```

#### Parameters

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`docId`: The id of the record to retrieve.

`callback`: Fires whenever the record or it relations are updated in the database.

`errorCallback`: Fires whenever the listener throw an error.

`options.only`: Only query the cache, or both the cache and the server (default).

`options.relations`: Include related records. Optionally specify a subset of relation fields to retrieve.

`options.noComputedFields`: Exclude computed fields from the record.

`options.noEmbeddingFields`: Exclude embeddings fields from the record.

#### Returns

An unsubscribe function.

## subscribeMany

Add a listener to a collection in the database.

```
(
    path: string[],
    constraints: QueryConstraint[],
    callback: (
        docs: StokerRecord[],
        cursor: Cursor,
        metadata: SnapshotMetadata | undefined
    ) => void,
    errorCallback?: (error: Error) => void,
    options?: {
        only?: "cache" | "default"
        relations?:
            | boolean
            | {
                fields: (string | CollectionField)[]
            }
        pagination?: {
            number?: number
            orderByField?: string | FieldPath
            orderByDirection?: "asc" | "desc"
            startAfter?: Cursor
            endBefore?: Cursor
            startAt?: Cursor
            endAt?: Cursor
        }
        noComputedFields?: boolean;
        noEmbeddingFields?: boolean;
    }
) => Promise<{
    pages: number | undefined;
    count: number | undefined;
    unsubscribe: (direction?: "first" | "last") => void;
}>
```

#### Parameters

`path`: The path to the collection for the records i.e. `["Clients"]`. If the records are in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`constraints`: Provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to the query.

`callback`: Fires whenever the records or their relations are updated in the database. Returns the results of the query, a cursor that can be passed to `startAt`, `endAt`, `startAfter` or `endBefore` in `options.pagination` below and the [Firestore snapshot metadata](https://firebase.google.com/docs/firestore/query-data/listen#events-metadata-changes).

`errorCallback`: Fires whenever the listener throw an error.

`options.only`: Only query the cache, or both the cache and the server (default).

`options.relations`: Include related records. Optionally specify a subset of relation fields to retrieve.

`options.pagination`: Optionally specify a number of results per page. Optionally enable sorting of results. Optionally provide a cursor object for `startAt`, `endAt`, `startAfter` or `endBefore`.

`options.noEmbeddingFields`: Exclude embeddings fields from the record.

`options.noComputedFields`: Exclude computed fields from the record.

#### Returns

`pages`: The number of pages returned.

`count`: The number of records returned.

`unsubscribe`: An unsubscribe function.

## waitForPendingWrites

`() => Promise<void>`

Fires when all pending Firestore writes have persisted to the server.

## getFiles

Retrieve a list of metadata objects for the files uploaded to a record.

`(path: string, record: StokerRecord) => Promise<StorageItem[]>`

#### Parameters

`path`: The path to the collection for the record to retrieve files for i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`record`: The id of the record to retrieve files for.

#### Returns

An array of Firebase Storage items.

## preloadCollection

Load or reload the [preload cache](/docs/api-reference/Collection%20Config%20Files#preload-cache-config) for a collection.

```
(
    collection: string,
    constraints?: [string, WhereFilterOp, unknown][],
) => Promise<void>
```

## sendMail

Send an email out of the system. You'll need to add Firestore Security Rules in `firebase-rules/firestore.custom.rules`.

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

## sendAdminEmail

Send an email to the system administrator email defined in `ADMIN_EMAIL` in `.env/.env`.

```
(
    subject: string,
    text?: string,
    html?: string,
    cc?: string | string[],
    bcc?: string | string[],
    replyTo?: string
) => Promise<void>
```

## sendMessage

`(to: string, body: string) => Promise<void>`

Send an SMS out of the system. The `to` field must be a phone number starting with `+`. You'll need to add Firestore Security Rules in `firebase-rules/firestore.custom.rules`.

## sendAdminSMS

`(body: string) => Promise<void>`

Send an SMS to the system administrator phone number defined in `ADMIN_SMS` in `.env/.env`.

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

Set a Javascript date object to the user's local timezone while keeping the current date and time.

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
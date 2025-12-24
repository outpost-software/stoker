---
sidebar_position: 8
---

We recommend using the [Web](/docs/api-reference/Web%20SDK) and [Node](/docs/api-reference/Node%20SDK) SDKs for working with your data, but in cases where that is not possible, Stoker offers an API.

This API is powered by [callable Cloud Functions](https://firebase.google.com/docs/functions/callable), making it highly scalable.

To access your app's API:

1. [Authenticate a user in Firebase](https://firebase.google.com/docs/auth/web/password-auth#sign_in_a_user_with_an_email_address_and_password)

2. Use the `stoker-writeapi` and `stoker-readapi` [callable functions](https://firebase.google.com/docs/functions/callable#web_4).

## Read API

#### Request Parameters

`path`: The path to the collection for the record(s) i.e. `["Clients"]`. If the record(s) are in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`id`: Include an id to get a single record.

`constraints`: Only relevant when retrieving multiple records. Provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to the query in the format `[string, WhereFilterOp, unknown][]`.

`options`: Any of the options that can be provided to [getOne](/docs/api-reference/Node%20SDK#getone) or [getSome](/docs/api-reference/Node%20SDK#getsome) in the Node SDK.

#### Returns

A `result` object containing either the single record or an array of records.

## Write API

#### Request Parameters

`operation`: `"create"`, `"update"` or `"delete"`

`path`: The path to the collection for the record i.e. `["Clients"]`. If the record is in a subcollection, the path will look more like `["Clients", "D89X6ZQ1sclE71BfsWmv", "Sites"]`.

`id`: The id of the record, if this is an update or delete operation.

`record`: The record to save, if this is a create or update operation.

`userData`: Access credentials for the record, if this is a create or update operation. See [addRecord](/docs/api-reference/Node%20SDK#parameters-1) and [updateRecord](/docs/api-reference/Node%20SDK#parameters-2) in the Node SDK.

#### Returns

A `result` object containing the record that was written.

## Search API

#### Request Parameters

`collection`: The collection to search.

`query`: The search query

`hitsPerPage`: The number of results to return

`constraints`: Provide [Firestore where()](https://firebase.google.com/docs/firestore/query-data/queries#simple_queries) query constraints to the search query

#### Returns

An array of record IDs.
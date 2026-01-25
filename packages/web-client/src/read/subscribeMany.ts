import {
    DocumentSnapshot,
    FieldPath,
    Query,
    QueryConstraint,
    SnapshotMetadata,
    Unsubscribe,
    endAt,
    endBefore,
    getCountFromServer,
    getFirestore,
    limit,
    limitToLast,
    onSnapshot,
    onSnapshotsInSync,
    orderBy,
    query,
    startAfter,
    startAt,
} from "firebase/firestore"
import {
    CollectionField,
    PostOperationHookArgs,
    PostReadHookArgs,
    PreOperationHookArgs,
    PreReadHookArgs,
    StokerRecord,
    StokerRelation,
} from "@stoker-platform/types"
import { getCollectionRefs } from "./getCollectionRefs"
import {
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getGlobalConfigModule,
    getSchema,
    getCurrentUserRoleGroups,
} from "../initializeStoker"
import cloneDeep from "lodash/cloneDeep.js"
import {
    getCachedConfigValue,
    getRelatedCollections,
    isPaginationEnabled,
    isRelationField,
    removeDeletedFields,
    runHooks,
    tryPromise,
    updateFieldReference,
} from "@stoker-platform/utils"
import { Cursor, getOne } from "../main"
import { subscribeOne } from "./subscribeOne"

export interface SubscribeManyOptions {
    only?: "cache" | "default"
    getAll?: boolean
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
    noComputedFields?: boolean
    noEmbeddingFields?: boolean
}

const validateFirstCursor = (cursor: Cursor) => {
    const firstCursorId = cursor.first.values().next().value?.id
    if (!firstCursorId) throw new Error("INPUT_ERROR: Invalid first cursor state")

    cursor.first.forEach((value) => {
        if (value?.id !== firstCursorId) {
            throw new Error("INPUT_ERROR: Mismatched first cursor IDs")
        }
    })
}

const validateLastCursor = (cursor: Cursor) => {
    const lastCursorId = cursor.last.values().next().value?.id
    if (!lastCursorId) throw new Error("INPUT_ERROR: Invalid last cursor state")

    cursor.last.forEach((value) => {
        if (value?.id !== lastCursorId) {
            throw new Error("INPUT_ERROR: Mismatched last cursor IDs")
        }
    })
}

export const subscribeMany = async (
    path: string[],
    constraints: QueryConstraint[],
    callback: (docs: StokerRecord[], cursor: Cursor, metadata: SnapshotMetadata | undefined) => void,
    errorCallback?: (error: Error) => void,
    options?: SubscribeManyOptions,
) => {
    const collection = path.at(-1)
    if (!collection) throw new Error("EMPTY_PATH")
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    const schema = getSchema(true)
    const roleGroups = getCurrentUserRoleGroups()
    // eslint-disable-next-line security/detect-object-injection
    const roleGroup = roleGroups[collection]
    const db = getFirestore()
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    const { labels, preloadCache, access } = collectionSchema
    const { serverReadOnly } = access
    const globalConfig = getGlobalConfigModule()
    const collectionFound = Object.keys(schema.collections).includes(collection)
    const collectionDisabled = globalConfig.disabledCollections?.includes(collection)
    if (!collectionFound || collectionDisabled) throw new Error("COLLECTION_NOT_FOUND")
    const customization = getCollectionConfigModule(labels.collection)
    const serverTimestampOptions = await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "serverTimestampOptions",
    ])
    const isPreloadCacheEnabled = preloadCache?.roles?.includes(permissions.Role)

    if (options?.pagination?.number !== undefined) {
        const paginationNumber = options.pagination.number
        if (
            typeof paginationNumber !== "number" ||
            !Number.isFinite(paginationNumber) ||
            !Number.isInteger(paginationNumber) ||
            paginationNumber < 1
        ) {
            throw new Error("INPUT_ERROR: Pagination number must be a positive finite integer")
        }
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const refs = getCollectionRefs(path, roleGroup, options?.getAll)
    if (refs.length === 0) return { pages: 0, count: 0, unsubscribe: () => {} }
    let constraintRefs = refs.map((ref) => query(ref, ...constraints))
    const cursor = options?.pagination?.startAfter ||
        options?.pagination?.endBefore ||
        options?.pagination?.startAt ||
        options?.pagination?.endAt || {
            first: new Map<number, DocumentSnapshot>(),
            last: new Map<number, DocumentSnapshot>(),
        }
    if (options?.pagination) {
        if (
            (options.pagination.startAfter && options.pagination.endBefore) ||
            (options.pagination.startAfter && options.pagination.endAt) ||
            (options.pagination.startAfter && options.pagination.startAt) ||
            (options.pagination.startAt && options.pagination.endBefore) ||
            (options.pagination.startAt && options.pagination.endAt) ||
            (options.pagination.endBefore && options.pagination.endAt)
        ) {
            throw new Error("INPUT_ERROR: Only one of startAfter, startAt, endBefore, or endAt can be provided")
        }
        const hasPagination =
            options.pagination.startAfter ||
            options.pagination.endBefore ||
            options.pagination.startAt ||
            options.pagination.endAt
        const paginationEnabled = isPaginationEnabled(permissions.Role, collectionSchema, schema)
        if (hasPagination && paginationEnabled !== true) {
            throw new Error("INPUT_ERROR: Pagination is not allowed when using " + paginationEnabled)
        }
        if (
            !(
                options.pagination.startAfter ||
                options.pagination.endBefore ||
                options.pagination.startAt ||
                options.pagination.endAt
            )
        ) {
            constraintRefs = constraintRefs.map((ref) => {
                let queryScope = query(ref)
                if (options.pagination?.orderByField && options.pagination.orderByDirection) {
                    queryScope = query(
                        ref,
                        orderBy(options.pagination.orderByField, options.pagination.orderByDirection),
                    )
                }
                if (options.pagination!.number) {
                    queryScope = query(queryScope, limit(options.pagination!.number))
                }
                return queryScope
            })
        } else if (options.pagination.startAfter) {
            validateLastCursor(options.pagination.startAfter)
            constraintRefs = constraintRefs.map((ref, index) => {
                if (!options.pagination?.orderByField || !options.pagination.orderByDirection) {
                    throw new Error(
                        "INPUT_ERROR: orderByField and orderByDirection must be provided when using startAfter",
                    )
                }
                let queryScope = query(
                    ref,
                    orderBy(options.pagination!.orderByField, options.pagination!.orderByDirection),
                    startAfter(cursor.last.get(index)),
                )
                if (options.pagination!.number) {
                    queryScope = query(queryScope, limit(options.pagination!.number))
                }
                return queryScope
            })
        } else if (options.pagination.endBefore) {
            validateFirstCursor(options.pagination.endBefore)
            constraintRefs = constraintRefs.map((ref, index) => {
                if (!options.pagination?.orderByField || !options.pagination.orderByDirection) {
                    throw new Error(
                        "INPUT_ERROR: orderByField and orderByDirection must be provided when using endBefore",
                    )
                }
                let queryScope = query(
                    ref,
                    orderBy(options.pagination!.orderByField, options.pagination!.orderByDirection),
                    endBefore(cursor.first.get(index)),
                )
                if (options.pagination!.number) {
                    queryScope = query(queryScope, limitToLast(options.pagination!.number))
                }
                return queryScope
            })
        } else if (options.pagination.startAt) {
            validateFirstCursor(options.pagination.startAt)
            constraintRefs = constraintRefs.map((ref, index) => {
                if (!options.pagination?.orderByField || !options.pagination.orderByDirection) {
                    throw new Error(
                        "INPUT_ERROR: orderByField and orderByDirection must be provided when using startAt",
                    )
                }
                let queryScope = query(
                    ref,
                    orderBy(options.pagination!.orderByField, options.pagination!.orderByDirection),
                    startAt(cursor.first.get(index)),
                )
                if (options.pagination!.number) {
                    queryScope = query(queryScope, limitToLast(options.pagination!.number))
                }
                return queryScope
            })
        } else if (options.pagination.endAt) {
            validateLastCursor(options.pagination.endAt)
            constraintRefs = constraintRefs.map((ref, index) => {
                if (!options.pagination?.orderByField || !options.pagination.orderByDirection) {
                    throw new Error("INPUT_ERROR: orderByField and orderByDirection must be provided when using endAt")
                }
                let queryScope = query(
                    ref,
                    orderBy(options.pagination!.orderByField, options.pagination!.orderByDirection),
                    endAt(cursor.last.get(index)),
                )
                if (options.pagination!.number) {
                    queryScope = query(queryScope, limitToLast(options.pagination!.number))
                }
                return queryScope
            })
        }
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context: any = { collection: labels.collection }
    const preOperationArgs: PreOperationHookArgs = ["read", undefined, undefined, context]
    await runHooks("preOperation", globalConfig, customization, preOperationArgs)
    const preReadArgs: PreReadHookArgs = [context, constraintRefs, true, true]
    await runHooks("preRead", globalConfig, customization, preReadArgs)

    let initialLoad = true
    const loaded = new Map()
    const docRelationsStatus = new Map()
    const listeners: Unsubscribe[] = []

    const docs = new Map<string, StokerRecord>()
    const fieldReferences = new Map()
    const referenceCount = new Map()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendData = (cursor: Cursor, metadata?: SnapshotMetadata, retrieverData?: any) => {
        const promises: Promise<void>[] = []
        docs.forEach((doc) => {
            removeDeletedFields(doc, fieldReferences.get(doc.id))
            for (const field of collectionSchema.fields) {
                if (field.type === "Computed" && !options?.noComputedFields) {
                    promises.push(
                        tryPromise(field.formula, [doc, retrieverData]).then((value) => {
                            doc[field.name] = value
                        }),
                    )
                }
                if (options?.noEmbeddingFields) {
                    if (field.type === "Embedding") {
                        delete doc[field.name]
                    }
                }
            }
        })

        Promise.all(promises).then(() => {
            callback(Array.from(docs.values()), cursor, metadata)

            docs.forEach((doc) => {
                const postOperationArgs: PostOperationHookArgs = ["read", doc, doc.id, context]
                runHooks("postOperation", globalConfig, customization, postOperationArgs)
                const postReadArgs: PostReadHookArgs = [context, refs, doc, true]
                runHooks("postRead", globalConfig, customization, postReadArgs)
            })
        })
    }

    const callbackOnLoaded = (cursor: Cursor, metadata?: SnapshotMetadata) => {
        let docsLoaded = true
        if (options?.relations) {
            docs.forEach((doc) => {
                const status = docRelationsStatus.get(doc.id)
                if (!(status === "loaded" || status === "deleted")) docsLoaded = false
            })
        }
        if (loaded.size === constraintRefs.length && docsLoaded) {
            initialLoad = false
            const unsubscribe = onSnapshotsInSync(db, () => {
                unsubscribe()

                if (!options?.noComputedFields && customization?.admin?.retriever) {
                    tryPromise(customization.admin.retriever).then((retrieverData) => {
                        sendData(cursor, metadata, retrieverData)
                    })
                } else {
                    sendData(cursor, metadata)
                }
            })
        }
    }

    if (typeof options?.relations === "object") {
        options.relations.fields = options.relations.fields.map((relation) => {
            if (typeof relation === "string") {
                const relationField = collectionSchema.fields.find((field) => field.name === relation)
                if (relationField) return relationField
                throw new Error(`SCHEMA_ERROR: Field ${relation} not found in collection ${collection}`)
            }
            return relation
        })
    }

    const relationsInitialized: { [id: string]: Map<string, boolean> } = {}
    const relationListeners: {
        [id: string]: Map<
            string,
            {
                doc: string
                type: string
                field: string
                listener: Unsubscribe
            }
        >
    } = {}

    const getRelations = (docData: StokerRecord, cursor: Cursor) => {
        if (!docData) return
        const docId = docData.id
        docRelationsStatus.set(docId, "loading")
        // eslint-disable-next-line security/detect-object-injection
        relationListeners[docId] ||= new Map()
        const relations = cloneDeep(options?.relations)
        const fields =
            typeof relations === "object"
                ? relations.fields.filter(
                      (field) =>
                          typeof field === "object" &&
                          isRelationField(field) &&
                          getRelatedCollections(collectionSchema, schema, permissions).includes(field.collection),
                  )
                : collectionSchema.fields.filter(
                      (field) =>
                          isRelationField(field) &&
                          getRelatedCollections(collectionSchema, schema, permissions).includes(field.collection),
                  )
        const relationsLoaded = new Map()
        const alreadyInitialized = new Map()
        // eslint-disable-next-line security/detect-object-injection
        relationsInitialized[docId] ||= new Map()
        for (const field of fields as CollectionField[]) {
            // eslint-disable-next-line security/detect-object-injection
            for (const relationListener of relationListeners[docId].entries()) {
                const [relationId, relation] = relationListener
                if (
                    relation.doc === docId &&
                    relation.type === field.type &&
                    relation.field === field.name &&
                    (!docs.has(docId) ||
                        // eslint-disable-next-line security/detect-object-injection
                        !docData[field.name][relationId])
                ) {
                    relation.listener()
                    // eslint-disable-next-line security/detect-object-injection
                    relationsInitialized[docId].delete(relationId)
                }
            }
        }
        for (const field of fields as CollectionField[]) {
            if ("collection" in field) {
                // eslint-disable-next-line security/detect-object-injection
                const relationObject = docData[field.name]
                if (!relationObject) continue
                for (const id of Object.keys(relationObject)) {
                    // eslint-disable-next-line security/detect-object-injection
                    if (!relationObject?.[id].id && !relationsInitialized[docId].has(id)) {
                        relationsLoaded.set(id, false)
                        // eslint-disable-next-line security/detect-object-injection
                        if (!relationsInitialized[docId].has(id)) {
                            // eslint-disable-next-line security/detect-object-injection
                            relationsInitialized[docId].set(id, true)
                        } else {
                            alreadyInitialized.set(id, true)
                        }
                    }
                }
            }
        }
        if (relationsLoaded.size === 0) {
            docRelationsStatus.set(docId, "loaded")
            callbackOnLoaded(cursor)
        } else {
            for (const field of fields as CollectionField[]) {
                if ("collection" in field) {
                    // eslint-disable-next-line security/detect-object-injection
                    const relationObject = docData[field.name]
                    if (!relationObject) continue
                    for (const [id, relation] of Object.entries(relationObject)) {
                        if (alreadyInitialized.has(id)) {
                            const getValue = async () => {
                                // eslint-disable-next-line security/detect-object-injection
                                if (relationObject[id].id) {
                                    relationsLoaded.set(id, true)
                                    if (Array.from(relationsLoaded.values()).every((value) => value)) {
                                        docRelationsStatus.set(docId, "loaded")
                                    }
                                } else {
                                    setTimeout(getValue, 100)
                                }
                            }
                            getValue()
                        } else {
                            const relationCollection = schema.collections[field.collection]
                            const { access } = relationCollection
                            const { serverReadOnly } = access
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            const isServerReadOnly = serverReadOnly?.includes(permissions.Role!)
                            if (!isServerReadOnly) {
                                subscribeOne(
                                    [...(relation as StokerRelation).Collection_Path],
                                    id,
                                    (relatedDocument) => {
                                        if (!relatedDocument) {
                                            // eslint-disable-next-line security/detect-object-injection
                                            delete relationObject[id]
                                            return
                                        }
                                        // eslint-disable-next-line security/detect-object-injection
                                        if (!docs.has(docId) || !relationObject?.[id]) {
                                            // eslint-disable-next-line security/detect-object-injection
                                            if (relationListeners[docId].has(id)) {
                                                // eslint-disable-next-line security/detect-object-injection
                                                relationListeners[docId].get(id)?.listener()
                                            }
                                            relationsLoaded.set(id, true)
                                            // eslint-disable-next-line security/detect-object-injection
                                            relationsInitialized[docId].delete(id)
                                            return
                                        }
                                        // eslint-disable-next-line security/detect-object-injection
                                        relationObject[id] = relatedDocument
                                        relationsLoaded.set(id, true)

                                        if (Array.from(relationsLoaded.values()).every((value) => value)) {
                                            docRelationsStatus.set(docId, "loaded")
                                            callbackOnLoaded(cursor)
                                        }
                                    },
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    (error: any) => {
                                        // eslint-disable-next-line security/detect-object-injection
                                        delete relationObject[id]
                                        if (error.code !== "permission-denied") {
                                            if (errorCallback)
                                                errorCallback(
                                                    new Error(
                                                        `Error fetching relation document in collection ${field.collection} with ID ${docId} at location ${(relation as StokerRelation).Collection_Path?.join("/")}`,
                                                        {
                                                            cause: error,
                                                        },
                                                    ),
                                                )
                                        }
                                    },
                                    { ...options, relations: false },
                                ).then((unsubscribe) => {
                                    // eslint-disable-next-line security/detect-object-injection
                                    if (!docs.has(docId) || !relationObject?.[id]) {
                                        unsubscribe()
                                        // eslint-disable-next-line security/detect-object-injection
                                        relationsInitialized[docId].delete(id)
                                        return
                                    }
                                    listeners.push(unsubscribe)
                                    // eslint-disable-next-line security/detect-object-injection
                                    relationListeners[docId].set(id, {
                                        doc: docId,
                                        type: field.type,
                                        field: field.name,
                                        listener: unsubscribe,
                                    })
                                })
                            } else {
                                getOne([...(relation as StokerRelation).Collection_Path], id)
                                    .then((relatedDocument) => {
                                        if (!relatedDocument) {
                                            // eslint-disable-next-line security/detect-object-injection
                                            delete relationObject[id]
                                            return
                                        }
                                        // eslint-disable-next-line security/detect-object-injection
                                        if (!docs.has(docId) || !relationObject?.[id]) {
                                            relationsLoaded.set(id, true)
                                            // eslint-disable-next-line security/detect-object-injection
                                            relationsInitialized[docId].delete(id)
                                            return
                                        }
                                        // eslint-disable-next-line security/detect-object-injection
                                        relationObject[id] = relatedDocument
                                        relationsLoaded.set(id, true)

                                        if (Array.from(relationsLoaded.values()).every((value) => value)) {
                                            docRelationsStatus.set(docId, "loaded")
                                            callbackOnLoaded(cursor)
                                        }
                                    })
                                    .catch((error) => {
                                        // eslint-disable-next-line security/detect-object-injection
                                        delete relationObject[id]
                                        if (error.code !== "permission-denied") {
                                            if (errorCallback) {
                                                errorCallback(
                                                    new Error(
                                                        `Error fetching relation document in collection ${field.collection} with ID ${docId} at location ${(relation as StokerRelation).Collection_Path?.join("/")}`,
                                                        {
                                                            cause: error,
                                                        },
                                                    ),
                                                )
                                            }
                                        }
                                    })
                            }
                        }
                    }
                }
            }
        }
    }

    const removeRelations = (docId: string) => {
        const relations = cloneDeep(options?.relations)
        const fields =
            typeof relations === "object"
                ? relations.fields.filter(
                      (field) =>
                          typeof field === "object" &&
                          isRelationField(field) &&
                          getRelatedCollections(collectionSchema, schema, permissions).includes(field.collection),
                  )
                : collectionSchema.fields.filter(
                      (field) =>
                          isRelationField(field) &&
                          getRelatedCollections(collectionSchema, schema, permissions).includes(field.collection),
                  )
        for (const field of fields as CollectionField[]) {
            // eslint-disable-next-line security/detect-object-injection
            if (!relationListeners[docId]) continue
            // eslint-disable-next-line security/detect-object-injection
            for (const relationListener of relationListeners[docId].entries()) {
                const [relationId, relation] = relationListener
                if (relation.doc === docId && relation.type === field.type && relation.field === field.name) {
                    relation.listener()
                    // eslint-disable-next-line security/detect-object-injection
                    relationsInitialized[docId].delete(relationId)
                }
            }
        }
    }

    const processDocument = (ref: Query, docData: StokerRecord, snapshot: DocumentSnapshot) => {
        const doc = snapshot.data({
            serverTimestamps: serverTimestampOptions || "none",
        }) as StokerRecord
        docData.id ||= snapshot.id
        docData = { ...docData, ...doc }
        delete docData.Collection_Path_String

        const documentFieldReference = fieldReferences.get(snapshot.id) || new Map()
        const fieldReference = documentFieldReference.get(ref) || new Set()
        updateFieldReference(doc, fieldReference)
        documentFieldReference.set(ref, fieldReference)
        fieldReferences.set(snapshot.id, documentFieldReference)

        docs.set(snapshot.id, docData)
    }

    const useCache = options?.only === "cache" || isPreloadCacheEnabled

    for (const ref of constraintRefs) {
        let first = true
        const listener = onSnapshot(
            ref,
            { source: useCache ? "cache" : "default", includeMetadataChanges: true },
            (snapshot) => {
                if (useCache || snapshot.metadata.fromCache === false) {
                    loaded.set(ref, true)
                    cursor.first.set(constraintRefs.indexOf(ref), snapshot.docs[0])
                    cursor.last.set(constraintRefs.indexOf(ref), snapshot.docs.at(-1) || snapshot.docs[0])
                    if (!(initialLoad && options?.relations)) {
                        callbackOnLoaded(cursor, snapshot.metadata)
                    }
                }
                if (loaded.get(ref) === true) {
                    if (first) {
                        snapshot.docs.forEach((docSnapshot) => {
                            const docData = docs.get(docSnapshot.id) || ({} as StokerRecord)
                            const documentReferenceCount = referenceCount.get(docSnapshot.id) || 0
                            referenceCount.set(docSnapshot.id, documentReferenceCount + 1)
                            processDocument(ref, docData, docSnapshot)
                        })
                        first = false
                    } else {
                        snapshot.docChanges().forEach((change) => {
                            const docData = docs.get(change.doc.id) || ({} as StokerRecord)
                            const documentReferenceCount = referenceCount.get(change.doc.id) || 0

                            if (change.type === "added") {
                                referenceCount.set(change.doc.id, documentReferenceCount + 1)
                            }
                            if (change.type === "added" || change.type === "modified") {
                                processDocument(ref, docData, change.doc)
                            } else if (change.type === "removed") {
                                referenceCount.set(change.doc.id, documentReferenceCount - 1)
                                if (referenceCount.get(change.doc.id) === 0) {
                                    docs.delete(change.doc.id)
                                    if (loaded.size === constraintRefs.length && options?.relations) {
                                        docRelationsStatus.set(change.doc.id, "deleted")
                                        removeRelations(change.doc.id)
                                    }
                                }
                            }
                        })
                    }
                    if (loaded.size === constraintRefs.length && options?.relations) {
                        if (docs.size === 0) {
                            callbackOnLoaded(cursor, snapshot.metadata)
                        }
                        docs.forEach((doc) => {
                            getRelations(doc, cursor)
                        })
                    }
                }
            },
            (error) => {
                if (errorCallback) {
                    errorCallback(new Error(`Error fetching documents at location ${path.join("/")}`, { cause: error }))
                }
                listeners.forEach((listener) => listener())
            },
        )
        listeners.push(listener)
    }
    let count, pages
    if (
        options?.pagination &&
        !preloadCache?.roles.includes(permissions.Role) &&
        !serverReadOnly?.includes(permissions.Role)
    ) {
        let constraintRef = query(refs[0], ...constraints)
        if (options.pagination.orderByField && options.pagination.orderByDirection) {
            constraintRef = query(
                constraintRef,
                orderBy(options.pagination.orderByField, options.pagination.orderByDirection),
            )
        }
        const snapshot = await getCountFromServer(constraintRef).catch(() => {})
        if (snapshot) {
            count = snapshot.data().count
            const paginationNumber = options.pagination.number
            pages = paginationNumber && paginationNumber > 0 ? Math.ceil(count / paginationNumber) : 1
        }
    }

    const unsubscribe = (direction?: "first" | "last") => {
        if (direction === "first") {
            validateFirstCursor(cursor)
        }
        if (direction === "last") {
            validateLastCursor(cursor)
        }
        listeners.forEach((listener) => listener())
    }

    return { pages, count, unsubscribe }
}

import {
    DocumentSnapshot,
    FieldPath,
    QueryConstraint,
    WhereFilterOp,
    endBefore,
    getCountFromServer,
    getDocs,
    getDocsFromCache,
    getDocsFromServer,
    limit,
    limitToLast,
    orderBy,
    query,
    startAfter,
} from "firebase/firestore"
import {
    CollectionCustomization,
    CollectionField,
    CollectionsSchema,
    PostOperationHookArgs,
    PostReadHookArgs,
    PreOperationHookArgs,
    PreReadHookArgs,
    StokerCollection,
    StokerRecord,
} from "@stoker-platform/types"
import { getCollectionRefs } from "./getCollectionRefs"
import {
    getCachedConfigValue,
    getRecordSubcollections,
    isPaginationEnabled,
    isRelationField,
    runHooks,
} from "@stoker-platform/utils"
import {
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getGlobalConfigModule,
    getSchema,
    getCurrentUserRoleGroups,
} from "../initializeStoker"
import cloneDeep from "lodash/cloneDeep.js"
import { getOne } from "./getOne"
import { getSomeServer } from "./getSomeServer"
import { Cursor } from "../main"

const getSubcollections = async (
    docData: StokerRecord,
    path: string[],
    subcollections: {
        collections?: StokerCollection[]
        depth: number
        constraints?: QueryConstraint[]
        limit?: {
            number: number
            orderByField: string
            orderByDirection: "asc" | "desc"
        }
    },
    schema: CollectionsSchema,
    relations?: { depth: number },
    only?: "cache" | "server",
    noEmbeddingFields?: boolean,
) => {
    const permissions = getCurrentUserPermissions()
    if (!permissions) throw new Error("PERMISSIONS_NOT_FOUND")
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionPath = path.at(-2)!
    // eslint-disable-next-line security/detect-object-injection
    const allSubcollections = getRecordSubcollections(schema.collections[collectionPath], schema, permissions).map(
        (collection) => collection.labels.collection,
    )
    if (subcollections.collections) {
        subcollections.collections.forEach((collection) => {
            if (!allSubcollections.includes(collection))
                throw new Error(
                    `SCHEMA_ERROR: Collection ${collection} not found in subcollections of ${collectionPath}`,
                )
        })
    } else {
        subcollections.collections = allSubcollections
    }
    const depth = subcollections.depth - 1
    const subcollectionPromises = subcollections.collections.map(async (subcollection) => {
        const result = await getSome([...path, subcollection], subcollections.constraints || [], {
            only,
            pagination: subcollections.limit,
            noEmbeddingFields,
        }).catch((error) => {
            if (error.code === "permission-denied")
                console.info(`PERMISSION_DENIED for subcollection ${subcollection} for document at ${path.join("/")}`)
            throw error
        })
        // eslint-disable-next-line security/detect-object-injection
        docData[subcollection] = result.docs
        if (relations) {
            await Promise.all(
                // eslint-disable-next-line security/detect-object-injection
                docData[subcollection].map((doc: StokerRecord) =>
                    getRelations(doc, [...path, subcollection, doc.id], relations, schema, only, noEmbeddingFields),
                ),
            )
        }
        if (depth > 0) {
            await Promise.all(
                // eslint-disable-next-line security/detect-object-injection
                docData[subcollection].map((doc: StokerRecord) =>
                    getSubcollections(
                        doc,
                        [...path, subcollection, doc.id],
                        { depth: depth },
                        schema,
                        relations,
                        only,
                        noEmbeddingFields,
                    ),
                ),
            )
        }
    })
    await Promise.all(subcollectionPromises)
    return
}

const getRelations = async (
    docData: StokerRecord,
    path: string[],
    relations: { fields?: CollectionField[]; depth: number },
    schema: CollectionsSchema,
    only?: "cache" | "server",
    noEmbeddingFields?: boolean,
) => {
    const permissions = getCurrentUserPermissions()
    if (!permissions) throw new Error("PERMISSIONS_NOT_FOUND")
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionPath = path.at(-2)!
    // eslint-disable-next-line security/detect-object-injection
    relations.fields ||= schema.collections[collectionPath].fields.filter((field) => isRelationField(field))
    const depth = relations.depth - 1
    const promises = []
    for (const field of relations.fields) {
        if ("collection" in field) {
            // eslint-disable-next-line security/detect-object-injection
            const relationsMap = docData[field.name]
            if (!relationsMap) continue
            const relationIds = Object.keys(relationsMap)
            for (const id of relationIds) {
                // eslint-disable-next-line security/detect-object-injection
                const relation = relationsMap[id]
                const promise = getOne(relation.Collection_Path, id, { only, noEmbeddingFields })
                    .then((result) => {
                        // eslint-disable-next-line security/detect-object-injection
                        relationsMap[id] = result
                        if (depth > 0) {
                            return getRelations(
                                // eslint-disable-next-line security/detect-object-injection
                                relationsMap[id] as StokerRecord,
                                [...relation.Collection_Path, id],
                                { depth: depth },
                                schema,
                                only,
                                noEmbeddingFields,
                            )
                        }
                        return
                    })
                    .catch((error) => {
                        if (error.message.includes("NOT_FOUND") || error.code === "permission-denied") {
                            // eslint-disable-next-line security/detect-object-injection
                            delete relationsMap[id]
                        } else {
                            throw error
                        }
                    })
                promises.push(promise)
            }
        }
    }
    await Promise.all(promises)
    return
}

export interface GetSomeOptions {
    getAll?: boolean
    only?: "cache" | "server"
    relations?: {
        fields?: (string | CollectionField)[]
        depth: number
    }
    subcollections?: {
        collections?: StokerCollection[]
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

export const getSome = async (
    path: string[],
    constraints?: QueryConstraint[] | [string, WhereFilterOp, unknown][],
    options?: GetSomeOptions,
) => {
    if (options?.subcollections?.depth && options.subcollections.depth > 10) {
        throw new Error("INPUT_ERROR: Subcollections depth cannot exceed 10")
    }
    if (options?.relations?.depth && options.relations.depth > 10) {
        throw new Error("INPUT_ERROR: Relations depth cannot exceed 10")
    }
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
    const collection = path.at(-1)
    if (!collection) throw new Error("EMPTY_PATH")
    const schema = getSchema(true)
    const roleGroups = getCurrentUserRoleGroups()
    // eslint-disable-next-line security/detect-object-injection
    const roleGroup = roleGroups[collection]
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    const { labels, access, preloadCache } = collectionSchema
    const { serverReadOnly } = access
    const globalConfig = getGlobalConfigModule()
    const collectionFound = Object.keys(schema.collections).includes(collection)
    const collectionDisabled = globalConfig.disabledCollections?.includes(collection)
    if (!collectionFound || collectionDisabled) throw new Error("COLLECTION_NOT_FOUND")
    const customization: CollectionCustomization = await getCollectionConfigModule(labels.collection)
    const serverTimestampOptions = await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "serverTimestampOptions",
    ])

    const currentUserPermissions = getCurrentUserPermissions()
    if (!currentUserPermissions?.Role) throw new Error("PERMISSIONS_DENIED")
    if (serverReadOnly?.includes(currentUserPermissions.Role)) {
        const result = await getSomeServer(path, constraints as [string, string, unknown][], options)
        return result
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const refs = getCollectionRefs(path, roleGroup, options?.getAll)
    if (refs.length === 0) return { cursor: {}, pages: 0, docs: [] }
    let constraintRefs = refs.map((ref) => query(ref, ...((constraints || []) as QueryConstraint[])))
    const cursor = options?.pagination?.startAfter ||
        options?.pagination?.endBefore || {
            first: new Map<number, DocumentSnapshot>(),
            last: new Map<number, DocumentSnapshot>(),
        }
    if (options?.pagination) {
        if (options.pagination.startAfter && options.pagination.endBefore) {
            throw new Error("INPUT_ERROR: startAfter and endBefore cannot be provided together")
        }
        const hasPagination = options.pagination.startAfter || options.pagination.endBefore
        const paginationEnabled = isPaginationEnabled(currentUserPermissions.Role, collectionSchema, schema)
        if (hasPagination && paginationEnabled !== true) {
            throw new Error("INPUT_ERROR: Pagination is not allowed when using " + paginationEnabled)
        }
        if (options.pagination.orderByField && options.pagination.orderByDirection) {
            if (!(options.pagination.startAfter || options.pagination.endBefore)) {
                constraintRefs = constraintRefs.map((ref) =>
                    query(
                        ref,
                        orderBy(options.pagination!.orderByField!, options.pagination!.orderByDirection),
                        limit(options.pagination!.number),
                    ),
                )
            } else if (options.pagination.startAfter) {
                constraintRefs = constraintRefs.map((ref, index) =>
                    query(
                        ref,
                        orderBy(options.pagination!.orderByField!, options.pagination!.orderByDirection),
                        startAfter(cursor.last.get(index)),
                        limit(options.pagination!.number),
                    ),
                )
            } else {
                constraintRefs = constraintRefs.map((ref, index) =>
                    query(
                        ref,
                        orderBy(options.pagination!.orderByField!, options.pagination!.orderByDirection),
                        endBefore(cursor.first.get(index)),
                        limitToLast(options.pagination!.number),
                    ),
                )
            }
        } else {
            if (!options.pagination.startAfter && !options.pagination.endBefore) {
                constraintRefs = constraintRefs.map((ref) => query(ref, limit(options.pagination!.number)))
            } else if (options.pagination.startAfter) {
                constraintRefs = constraintRefs.map((ref, index) =>
                    query(ref, startAfter(cursor.last.get(index)), limit(options.pagination!.number)),
                )
            } else {
                constraintRefs = constraintRefs.map((ref, index) =>
                    query(ref, endBefore(cursor.first.get(index)), limitToLast(options.pagination!.number)),
                )
            }
        }
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context: any = { collection: labels.collection }
    const preOperationArgs: PreOperationHookArgs = ["read", undefined, undefined, context]
    await runHooks("preOperation", globalConfig, customization, preOperationArgs)
    const preReadArgs: PreReadHookArgs = [context, constraintRefs, true, false]
    await runHooks("preRead", globalConfig, customization, preReadArgs)

    const docs = new Map<string, StokerRecord>()

    const snapshotPromises = constraintRefs.map(async (ref) => {
        let snapshot
        if (options?.only === "cache") snapshot = await getDocsFromCache(ref)
        else if (options?.only === "server") snapshot = await getDocsFromServer(ref)
        else snapshot = await getDocs(ref)
        return snapshot
    })

    const snapshots = await Promise.all(snapshotPromises)

    for (const snapshot of snapshots) {
        for (const doc of snapshot.docs) {
            if (!docs.has(doc.id)) {
                docs.set(doc.id, {} as StokerRecord)
            }
            const docData = doc.data({ serverTimestamps: serverTimestampOptions || "none" }) as StokerRecord
            const existingDocument = docs.get(doc.id) as StokerRecord
            existingDocument.id ||= doc.id
            const newDocument = { ...existingDocument, ...docData }
            delete newDocument.Collection_Path_String
            docs.set(doc.id, newDocument)
        }
        cursor.first.set(snapshots.indexOf(snapshot), snapshot.docs[0])
        cursor.last.set(snapshots.indexOf(snapshot), snapshot.docs.at(-1) || snapshot.docs[0])
    }

    let pages
    if (
        options?.pagination &&
        !preloadCache?.roles.includes(currentUserPermissions?.Role) &&
        !serverReadOnly?.includes(currentUserPermissions?.Role)
    ) {
        let constraintRef = query(refs[0], ...((constraints || []) as QueryConstraint[]))
        if (options.pagination.orderByField && options.pagination.orderByDirection) {
            constraintRef = query(
                constraintRef,
                orderBy(options.pagination.orderByField, options.pagination.orderByDirection),
            )
        }
        const snapshot = await getCountFromServer(constraintRef).catch(() => {})
        if (snapshot) {
            const count = snapshot.data().count
            const paginationNumber = options.pagination.number
            pages = paginationNumber > 0 ? Math.floor(count / paginationNumber) : 0
        }
    }

    for (const doc of docs.values()) {
        const operations = []
        const documentPath = [...doc.Collection_Path, doc.id]
        if (options?.subcollections) {
            operations.push(
                getSubcollections(
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    docs.get(doc.id)!,
                    documentPath,
                    cloneDeep(options.subcollections),
                    schema,
                    cloneDeep(options?.relations),
                    options?.only,
                    options?.noEmbeddingFields,
                ),
            )
        }
        if (options?.relations) {
            if (options.relations.fields) {
                options.relations.fields = options.relations.fields.map((relation) => {
                    if (typeof relation === "string") {
                        const relationField = collectionSchema.fields.find((field) => field.name === relation)
                        if (relationField) return relationField
                        throw new Error(`SCHEMA_ERROR: Field ${relation} not found in collection ${collection}`)
                    }
                    return relation
                })
            }
            operations.push(
                getRelations(
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    docs.get(doc.id)!,
                    documentPath,
                    cloneDeep(options.relations) as { fields: CollectionField[]; depth: number },
                    schema,
                    options?.only,
                    options?.noEmbeddingFields,
                ),
            )
        }
        await Promise.all(operations)

        for (const docData of docs.values()) {
            for (const field of collectionSchema.fields) {
                if (field.type === "Computed" && !options?.noComputedFields) {
                    docData[field.name] = await field.formula(docData)
                }
                if (options?.noEmbeddingFields) {
                    if (field.type === "Embedding") {
                        delete docData[field.name]
                    }
                }
            }
        }

        const postOperationArgs: PostOperationHookArgs = ["read", doc, doc.id, context]
        await runHooks("postOperation", globalConfig, customization, postOperationArgs)
        const postReadArgs: PostReadHookArgs = [context, refs, doc, false]
        await runHooks("postRead", globalConfig, customization, postReadArgs)
    }

    return { cursor, pages, docs: Array.from(docs.values()) }
}

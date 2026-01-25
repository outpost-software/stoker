import {
    CollectionField,
    CollectionsSchema,
    PostOperationHookArgs,
    PostReadHookArgs,
    PreOperationHookArgs,
    PreReadHookArgs,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import { getCollectionRefs } from "./getCollectionRefs.js"
import { DocumentSnapshot, getFirestore, QuerySnapshot, Transaction, WhereFilterOp } from "firebase-admin/firestore"
import { getGlobalConfigModule, getCustomizationFile, getTenant } from "../initializeStoker.js"
import {
    getRecordSubcollections,
    getSomeAccessControl,
    isPaginationEnabled,
    isRelationField,
    runHooks,
    getFieldCustomization,
    tryPromise,
} from "@stoker-platform/utils"
import { getOne } from "./getOne.js"
import cloneDeep from "lodash/cloneDeep.js"
import { fetchCurrentSchema } from "../utils/fetchSchema.js"

const getSubcollections = async (
    tenantId: string,
    docData: StokerRecord,
    path: string[],
    subcollections: {
        collections?: StokerCollection[]
        depth: number
        constraints?: [string, string, unknown][]
        limit?: {
            number: number
            orderByField: string
            orderByDirection: "asc" | "desc"
        }
    },
    schema: CollectionsSchema,
    relations?: { depth: number },
    only?: "cache" | "server",
    user?: string,
    transaction?: Transaction,
    noEmbeddingFields?: boolean,
) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionPath = path.at(-2)!
    // eslint-disable-next-line security/detect-object-injection
    const allSubcollections = getRecordSubcollections(schema.collections[collectionPath], schema).map(
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
        const result = await getSome([...path, subcollection], subcollections.constraints, {
            user,
            pagination: subcollections.limit,
            providedTransaction: transaction,
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
                    getRelations(
                        tenantId,
                        doc,
                        [...path, subcollection, doc.id],
                        relations,
                        schema,
                        undefined,
                        user,
                        transaction,
                        noEmbeddingFields,
                    ),
                ),
            )
        }
        if (depth > 0) {
            await Promise.all(
                // eslint-disable-next-line security/detect-object-injection
                docData[subcollection].map((doc: StokerRecord) =>
                    getSubcollections(
                        tenantId,
                        doc,
                        [...path, subcollection, doc.id],
                        { depth: depth },
                        schema,
                        relations,
                        only,
                        user,
                        transaction,
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
    tenantId: string,
    docData: StokerRecord,
    path: string[],
    relations: { fields?: CollectionField[]; depth: number },
    schema: CollectionsSchema,
    only?: "cache" | "server",
    user?: string,
    transaction?: Transaction,
    noEmbeddingFields?: boolean,
) => {
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
                const promise = getOne(relation.Collection_Path, id, {
                    user,
                    providedTransaction: transaction,
                    noEmbeddingFields,
                })
                    .then((result) => {
                        // eslint-disable-next-line security/detect-object-injection
                        relationsMap[id] = result
                        if (depth > 0) {
                            return getRelations(
                                tenantId,
                                // eslint-disable-next-line security/detect-object-injection
                                relationsMap[id] as StokerRecord,
                                [...relation.Collection_Path, id],
                                { depth: depth },
                                schema,
                                only,
                                user,
                                transaction,
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

export type Cursor = {
    first: Map<number, DocumentSnapshot>
    last: Map<number, DocumentSnapshot>
}

export interface GetSomeOptions {
    user?: string
    relations?: {
        fields?: (string | CollectionField)[]
        depth: number
    }
    subcollections?: {
        collections?: StokerCollection[]
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

export const getSome = async (path: string[], constraints?: [string, string, unknown][], options?: GetSomeOptions) => {
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

    const tenantId = getTenant()
    const db = getFirestore()

    let pages: number
    let cursor: Cursor
    let docs: Map<string, StokerRecord>

    const runTransaction = async (transaction: Transaction) => {
        const [permissionsSnapshot, maintenanceMode, latestSchema] = await Promise.all([
            options?.user
                ? transaction.get(
                      db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(options.user),
                  )
                : Promise.resolve(Promise.resolve({} as DocumentSnapshot)),
            transaction.get(db.collection("system_deployment").doc("maintenance_mode")),
            fetchCurrentSchema(true),
        ])

        if (!maintenanceMode.exists) throw new Error("MAINTENANCE_MODE")
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const maintenance = maintenanceMode.data()!
        if (maintenance.active) throw new Error("MAINTENANCE_MODE")

        const schema = latestSchema
        let permissions: StokerPermissions | undefined

        const globalConfig = getGlobalConfigModule()
        const collectionName = path.at(-1)
        if (!collectionName) throw new Error("EMPTY_PATH")
        const collectionFound = Object.keys(schema.collections).includes(collectionName)
        const collectionDisabled = globalConfig.disabledCollections?.includes(collectionName)
        if (!collectionFound || collectionDisabled) throw new Error("COLLECTION_NOT_FOUND")
        // eslint-disable-next-line security/detect-object-injection
        const collectionSchema = schema.collections[collectionName]
        const { labels } = collectionSchema
        const customization = getCustomizationFile(labels.collection, schema)

        if (options?.user) {
            if (!permissionsSnapshot?.exists) throw new Error("PERMISSION_DENIED")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            permissions = permissionsSnapshot.data()!
            if (!permissions.Role) throw new Error("USER_ERROR")
            if (!permissions.Enabled) throw new Error("PERMISSION_DENIED")
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let refs = getCollectionRefs(tenantId, path, schema, options?.user, permissions!)
        if (refs.length === 0) return { cursor: {}, pages: 0, docs: [] }
        if (constraints) {
            refs = refs.map((ref) => {
                constraints.forEach(([field, operator, value]) => {
                    ref = ref.where(field, operator as WhereFilterOp, value)
                })
                return ref
            })
        }

        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        cursor = options?.pagination?.startAfter ||
            options?.pagination?.endBefore || {
                first: new Map<number, DocumentSnapshot>(),
                last: new Map<number, DocumentSnapshot>(),
            }
        if (options?.pagination) {
            if (options.pagination.startAfter && options.pagination.endBefore) {
                throw new Error("INPUT_ERROR: startAfter and endBefore cannot be provided together")
            }
            const hasPagination = options.pagination.startAfter || options.pagination.endBefore
            if (options?.user) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const paginationEnabled = isPaginationEnabled(permissions!.Role!, collectionSchema, schema)
                if (hasPagination && paginationEnabled !== true) {
                    throw new Error("INPUT_ERROR: Pagination is not allowed when using " + paginationEnabled)
                }
            }
            if (options.pagination.orderByField && options.pagination.orderByDirection) {
                if (!options.pagination.startAfter && !options.pagination.endBefore) {
                    refs = refs.map((ref) =>
                        ref
                            .orderBy(options.pagination!.orderByField!, options.pagination!.orderByDirection)
                            .limit(options.pagination!.number),
                    )
                } else if (options.pagination.startAfter) {
                    refs = refs.map((ref, index) =>
                        ref
                            .orderBy(options.pagination!.orderByField!, options.pagination!.orderByDirection)
                            .startAfter(cursor.last.get(index))
                            .limit(options.pagination!.number),
                    )
                } else {
                    refs = refs.map((ref, index) =>
                        ref
                            .orderBy(options.pagination!.orderByField!, options.pagination!.orderByDirection)
                            .endBefore(cursor.first.get(index))
                            .limitToLast(options.pagination!.number),
                    )
                }
            } else {
                if (!options.pagination.startAfter && !options.pagination.endBefore) {
                    refs = refs.map((ref) => ref.limit(options.pagination!.number))
                } else if (options.pagination.startAfter) {
                    refs = refs.map((ref, index) =>
                        ref.startAfter(cursor.last.get(index)).limit(options.pagination!.number),
                    )
                } else {
                    refs = refs.map((ref, index) =>
                        ref.endBefore(cursor.first.get(index)).limitToLast(options.pagination!.number),
                    )
                }
            }
        }
        /* eslint-enable @typescript-eslint/no-non-null-assertion */

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const context: any = {}
        const preOperationArgs: PreOperationHookArgs = ["read", undefined, undefined, context]
        await runHooks("preOperation", globalConfig, customization, preOperationArgs)
        const preReadArgs: PreReadHookArgs = [context, refs, true, false]
        await runHooks("preRead", globalConfig, customization, preReadArgs)

        docs = new Map<string, StokerRecord>()

        const snapshotPromises = refs.map(async (ref) => {
            const snapshot: QuerySnapshot = await transaction.get(ref)
            return snapshot
        })

        const snapshots = await Promise.all(snapshotPromises)

        for (const snapshot of snapshots) {
            for (const doc of snapshot.docs) {
                if (!docs.has(doc.id)) {
                    docs.set(doc.id, {} as StokerRecord)
                }
                const docData = doc.data() as StokerRecord
                const existingDocument = docs.get(doc.id) as StokerRecord
                existingDocument.id ||= doc.id
                const newDocument = { ...existingDocument, ...docData }
                delete newDocument.Collection_Path_String
                docs.set(doc.id, newDocument)
            }
            cursor.first.set(snapshots.indexOf(snapshot), snapshot.docs[0])
            cursor.last.set(snapshots.indexOf(snapshot), snapshot.docs.at(-1) || snapshot.docs[0])
        }

        if (options?.pagination) {
            let constraintRef = refs[0]
            if (constraints) {
                constraintRef = constraints.reduce((ref, [field, operator, value]) => {
                    return ref.where(field, operator as WhereFilterOp, value)
                }, constraintRef)
            }
            if (options.pagination.orderByField && options.pagination.orderByDirection) {
                constraintRef = constraintRef.orderBy(
                    options.pagination.orderByField,
                    options.pagination.orderByDirection,
                )
            }
            const snapshot = await constraintRef.count().get()
            const count = snapshot.data().count
            const paginationNumber = options.pagination.number
            pages = paginationNumber > 0 ? Math.ceil(count / paginationNumber) : 0
        }

        let retrieverData
        if (!options?.noComputedFields) {
            retrieverData = await tryPromise(customization.admin?.retriever)
        }

        for (const doc of docs.values()) {
            const operations = []
            const documentPath = [...doc.Collection_Path, doc.id]
            if (options?.subcollections) {
                operations.push(
                    getSubcollections(
                        tenantId,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        docs.get(doc.id)!,
                        documentPath,
                        cloneDeep(options.subcollections),
                        schema,
                        cloneDeep(options?.relations),
                        undefined,
                        options.user,
                        options.transactional ? transaction : undefined,
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
                            throw new Error(`SCHEMA_ERROR: Field ${relation} not found in collection ${collectionName}`)
                        }
                        return relation
                    })
                }
                operations.push(
                    getRelations(
                        tenantId,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        docs.get(doc.id)!,
                        documentPath,
                        cloneDeep(options.relations) as { fields: CollectionField[]; depth: number },
                        schema,
                        undefined,
                        options.user,
                        options.transactional ? transaction : undefined,
                        options?.noEmbeddingFields,
                    ),
                )
            }

            await Promise.all(operations)

            const computedFieldPromises = []
            for (const field of collectionSchema.fields) {
                if (field.type === "Computed" && !options?.noComputedFields) {
                    const fieldCustomization = getFieldCustomization(field, customization)
                    if (!fieldCustomization.formula) continue
                    computedFieldPromises.push(
                        tryPromise(fieldCustomization.formula, [doc, retrieverData]).then((result) => {
                            doc[field.name] = result
                        }),
                    )
                }
                if (options?.noEmbeddingFields) {
                    if (field.type === "Embedding") {
                        delete doc[field.name]
                    }
                }
            }
            await Promise.all(computedFieldPromises)

            if (options?.user && permissions?.Role) {
                const role = permissions.Role
                const allowedCollection =
                    customization.custom?.serverAccess?.read !== undefined
                        ? await tryPromise(customization.custom.serverAccess.read, [role, doc])
                        : true
                if (!allowedCollection) {
                    docs.delete(doc.id)
                    continue
                }
                for (const field of collectionSchema.fields) {
                    const accessible = !field.access || field.access.includes(role)
                    const fieldCustomization = getFieldCustomization(field, customization)
                    const allowField =
                        fieldCustomization?.custom?.serverAccess?.read !== undefined
                            ? await tryPromise(fieldCustomization.custom.serverAccess.read, [role, doc])
                            : true
                    if (!accessible || !allowField) {
                        if (isRelationField(field)) {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            delete docs.get(doc.id)![field.name]
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            delete docs.get(doc.id)![`${field.name}_Array`]
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            delete docs.get(doc.id)![`${field.name}_Single`]
                        } else {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            delete docs.get(doc.id)![field.name]
                        }
                    }
                }
            }

            const postOperationArgs: PostOperationHookArgs = ["read", doc, doc.id, context]
            await runHooks("postOperation", globalConfig, customization, postOperationArgs)
            const postReadArgs: PostReadHookArgs = [context, refs, doc, false]
            await runHooks("postRead", globalConfig, customization, postReadArgs)
        }

        if (options?.user) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await getSomeAccessControl(Array.from(docs.values()), collectionSchema, schema, options.user, permissions!)
        }

        return
    }

    if (options?.providedTransaction) {
        await runTransaction(options.providedTransaction)
    } else {
        await db.runTransaction(
            async (transaction) => {
                await runTransaction(transaction)
            },
            { readOnly: true },
        )
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return { cursor: cursor!, pages: pages!, docs: Array.from(docs!.values()) }
}

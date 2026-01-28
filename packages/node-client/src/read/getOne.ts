import {
    CollectionField,
    CollectionPermissions,
    CollectionsSchema,
    PostOperationHookArgs,
    PostReadHookArgs,
    PreOperationHookArgs,
    PreReadHookArgs,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
    StokerRelation,
} from "@stoker-platform/types"
import { getDocumentRefs } from "./getDocumentRefs.js"
import { getCustomizationFile, getGlobalConfigModule, getTenant } from "../initializeStoker.js"
import { getSome } from "./getSome.js"
import {
    collectionAccess,
    getOneAccessControl,
    getRecordSubcollections,
    isRelationField,
    runHooks,
    getFieldCustomization,
    tryPromise,
} from "@stoker-platform/utils"
import { DocumentSnapshot, getFirestore, Transaction } from "firebase-admin/firestore"
import { fetchCurrentSchema } from "../utils/fetchSchema.js"

const getSubcollections = async (
    tenantId: string,
    transaction: Transaction,
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
    user?: string,
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
        const result = await getSome([...path, subcollection], subcollections.constraints || [], {
            user,
            relations,
            pagination: subcollections.limit,
            providedTransaction: transaction,
        }).catch((error) => {
            if (error.code === "permission-denied")
                console.info(`PERMISSION_DENIED for subcollection ${subcollection} for document at ${path.join("/")}`)
            throw error
        })
        // eslint-disable-next-line security/detect-object-injection
        docData[subcollection] = result.docs
        if (depth > 0) {
            await Promise.all(
                // eslint-disable-next-line security/detect-object-injection
                docData[subcollection].map(async (doc: StokerRecord) => {
                    await getSubcollections(
                        tenantId,
                        transaction,
                        doc,
                        [...path, subcollection, doc.id],
                        { depth: depth },
                        schema,
                        relations,
                        user,
                    )
                }),
            )
        }
    })
    await Promise.all(subcollectionPromises)
    return
}

const getRelations = async (
    tenantId: string,
    transaction: Transaction,
    docData: StokerRecord,
    path: string[],
    schema: CollectionsSchema,
    relations: { fields?: CollectionField[]; depth: number },
    user?: string,
    noComputedFields?: boolean,
    noEmbeddingFields?: boolean,
) => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionPath = path.at(-2)!
    // eslint-disable-next-line security/detect-object-injection
    relations.fields ||= schema.collections[collectionPath].fields.filter((field) => isRelationField(field))
    const depth = relations.depth - 1
    const relationPromises = []
    for (const field of relations.fields) {
        if ("collection" in field) {
            // eslint-disable-next-line security/detect-object-injection
            const relationObject = docData[field.name]
            if (!relationObject) continue
            for (const [id, relation] of Object.entries(relationObject)) {
                const promise = getOne((relation as StokerRelation).Collection_Path, id, {
                    user,
                    providedTransaction: transaction,
                    noComputedFields,
                    noEmbeddingFields,
                })
                    .then((result) => {
                        // eslint-disable-next-line security/detect-object-injection
                        relationObject[id] = result
                        if (depth > 0) {
                            return getRelations(
                                tenantId,
                                transaction,
                                // eslint-disable-next-line security/detect-object-injection
                                relationObject[id] as StokerRecord,
                                [...(relation as StokerRelation).Collection_Path, id],
                                schema,
                                { depth: depth },
                                user,
                                noComputedFields,
                                noEmbeddingFields,
                            )
                        }
                        return
                    })
                    .catch((error) => {
                        if (error.message.includes("NOT_FOUND") || error.code === "permission-denied") {
                            // eslint-disable-next-line security/detect-object-injection
                            delete relationObject[id]
                        } else {
                            throw error
                        }
                    })
                relationPromises.push(promise)
            }
        }
    }
    await Promise.all(relationPromises)
    return
}

export interface GetOneOptions {
    user?: string
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
    relations?: {
        fields?: (string | CollectionField)[]
        depth: number
    }
    providedTransaction?: Transaction
    noComputedFields?: boolean
    noEmbeddingFields?: boolean
}

export const getOne = async (path: string[], docId: string, options?: GetOneOptions) => {
    if (options?.subcollections?.depth && options.subcollections.depth > 10) {
        throw new Error("INPUT_ERROR: Subcollections depth cannot exceed 10")
    }
    if (options?.relations?.depth && options.relations.depth > 10) {
        throw new Error("INPUT_ERROR: Relations depth cannot exceed 10")
    }

    const tenantId = getTenant()
    const db = getFirestore()

    let docData: StokerRecord

    const runTransaction = async (transaction: Transaction) => {
        const [permissionsSnapshot, maintenanceMode, latestSchema] = await Promise.all([
            options?.user
                ? transaction.get(
                      db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(options.user),
                  )
                : Promise.resolve({} as DocumentSnapshot),
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

        let collectionPermissions: CollectionPermissions | undefined
        if (options?.user) {
            if (!permissionsSnapshot?.exists) throw new Error("PERMISSION_DENIED")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            permissions = permissionsSnapshot.data()!
            if (!permissions.Role) throw new Error("USER_ERROR")
            if (!permissions.Enabled) throw new Error("PERMISSION_DENIED")
            collectionPermissions = permissions.collections?.[labels.collection]
            if (!collectionPermissions) throw new Error("PERMISSION_DENIED")
        }

        if (options?.user) {
            if (!collectionPermissions || !collectionAccess("Read", collectionPermissions)) {
                throw new Error("PERMISSION_DENIED")
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const refs = getDocumentRefs(tenantId, path, docId, schema, permissions!)
        if (refs.length === 0) throw new Error("PERMISSION_DENIED")

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const context: any = {}
        const preOperationArgs: PreOperationHookArgs = ["read", undefined, docId, context]
        await runHooks("preOperation", globalConfig, customization, preOperationArgs)
        const preReadArgs: PreReadHookArgs = [context, refs, false, false]
        await runHooks("preRead", globalConfig, customization, preReadArgs)

        docData = {} as StokerRecord

        const snapshotPromises = refs.map((ref) => transaction.get(ref))
        const snapshots = (await Promise.all(snapshotPromises)) as unknown as DocumentSnapshot[]

        for (const snapshot of snapshots) {
            if (snapshot.exists) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const doc = snapshot.data()!
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                docData.id ||= snapshot.id
                docData = { ...docData, ...doc }
                delete docData.Collection_Path_String
            } else {
                throw new Error(
                    `NOT_FOUND: Document with ID ${docId} does not exist at location ${path?.join("/") || labels.collection}`,
                )
            }
        }

        const operations = []
        const documentPath = path ? [...path, docId] : [labels.collection, docId]
        if (options?.subcollections) {
            operations.push(
                getSubcollections(
                    tenantId,
                    transaction,
                    docData,
                    documentPath,
                    options.subcollections,
                    schema,
                    undefined,
                    options.user,
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
                    transaction,
                    docData,
                    documentPath,
                    schema,
                    options.relations as { fields: CollectionField[]; depth: number },
                    options.user,
                    options.noComputedFields,
                    options.noEmbeddingFields,
                ),
            )
        }
        await Promise.all(operations)

        if (!options?.noComputedFields) {
            for (const field of collectionSchema.fields) {
                if (field.type === "Computed") {
                    const fieldCustomization = getFieldCustomization(field, customization)
                    if (!fieldCustomization.formula) continue
                    docData[field.name] = await fieldCustomization.formula(docData)
                }
            }
        }
        if (options?.noEmbeddingFields) {
            for (const field of collectionSchema.fields) {
                if (field.type === "Embedding") {
                    delete docData[field.name]
                }
            }
        }

        if (options?.user && permissions?.Role) {
            const role = permissions.Role
            const allowedCollection =
                customization.custom?.serverAccess?.read !== undefined
                    ? await tryPromise(customization.custom?.serverAccess?.read, [role, docData])
                    : true
            if (!allowedCollection) throw new Error("PERMISSION_DENIED")
            for (const field of collectionSchema.fields) {
                const accessible = !field.access || field.access.includes(role)
                const fieldCustomization = getFieldCustomization(field, customization)
                const allowField =
                    fieldCustomization?.custom?.serverAccess?.read !== undefined
                        ? await tryPromise(fieldCustomization.custom.serverAccess.read, [role, docData])
                        : true
                if (!accessible || !allowField) {
                    if (isRelationField(field)) {
                        delete docData[field.name]
                        delete docData[`${field.name}_Array`]
                        delete docData[`${field.name}_Single`]
                    } else {
                        delete docData[field.name]
                    }
                }
            }
        }

        const postOperationArgs: PostOperationHookArgs = ["read", docData, docId, context]
        await runHooks("postOperation", globalConfig, customization, postOperationArgs)
        const postReadArgs: PostReadHookArgs = [context, refs, docData, false]
        await runHooks("postRead", globalConfig, customization, postReadArgs)

        if (options?.user) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            await getOneAccessControl(docData, collectionSchema, schema, options.user, permissions!)
        }
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
    return docData!
}

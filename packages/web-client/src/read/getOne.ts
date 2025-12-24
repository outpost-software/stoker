import { QueryConstraint, getDoc, getDocFromCache, getDocFromServer } from "firebase/firestore"
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
    StokerRelation,
} from "@stoker-platform/types"
import { getDocumentRefs } from "./getDocumentRefs"
import cloneDeep from "lodash/cloneDeep.js"
import { getSome } from "./getSome"
import {
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getCurrentUserRoleGroups,
    getGlobalConfigModule,
    getSchema,
} from "../initializeStoker"
import { getCachedConfigValue, getRecordSubcollections, isRelationField, runHooks } from "@stoker-platform/utils"
import { getOneServer } from "./getOneServer"

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
            relations,
            pagination: subcollections.limit,
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
                        doc,
                        [...path, subcollection, doc.id],
                        { depth: depth },
                        schema,
                        relations,
                        only,
                    )
                }),
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
    noComputedFields?: boolean,
    noEmbeddingFields?: boolean,
) => {
    const permissions = getCurrentUserPermissions()
    if (!permissions) throw new Error("PERMISSIONS_NOT_FOUND")
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
                    only,
                    noComputedFields,
                    noEmbeddingFields,
                })
                    .then((result) => {
                        // eslint-disable-next-line security/detect-object-injection
                        relationObject[id] = result
                        if (depth > 0) {
                            return getRelations(
                                // eslint-disable-next-line security/detect-object-injection
                                relationObject[id] as StokerRecord,
                                [...(relation as StokerRelation).Collection_Path, id],
                                { depth: depth },
                                schema,
                                only,
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

export const getOne = async (
    path: string[],
    docId: string,
    options?: {
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
        noComputedFields?: boolean
        noEmbeddingFields?: boolean
    },
) => {
    if (options?.subcollections?.depth && options.subcollections.depth > 10) {
        throw new Error("INPUT_ERROR: Subcollections depth cannot exceed 10")
    }
    if (options?.relations?.depth && options.relations.depth > 10) {
        throw new Error("INPUT_ERROR: Relations depth cannot exceed 10")
    }

    const collection = path.at(-1)
    if (!collection) throw new Error("EMPTY_PATH")
    const schema = getSchema(true)
    const roleGroups = getCurrentUserRoleGroups()
    // eslint-disable-next-line security/detect-object-injection
    const roleGroup = roleGroups[collection]
    const globalConfig = getGlobalConfigModule()
    const collectionFound = Object.keys(schema.collections).includes(collection)
    const collectionDisabled = globalConfig.disabledCollections?.includes(collection)
    if (!collectionFound || collectionDisabled) throw new Error("COLLECTION_NOT_FOUND")
    const serverTimestampOptions = await getCachedConfigValue(globalConfig, [
        "global",
        "firebase",
        "serverTimestampOptions",
    ])
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    const { labels, access } = collectionSchema
    const { serverReadOnly } = access
    const customization: CollectionCustomization = getCollectionConfigModule(labels.collection)

    const currentUserPermissions = getCurrentUserPermissions()
    if (!currentUserPermissions?.Role) throw new Error("PERMISSIONS_DENIED")
    if (serverReadOnly?.includes(currentUserPermissions.Role)) {
        const result = await getOneServer(path, docId, options)
        return result
    }

    const refs = getDocumentRefs(path, docId, roleGroup)
    if (refs.length === 0) throw new Error("PERMISSION_DENIED")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context: any = { collection: labels.collection }
    const preOperationArgs: PreOperationHookArgs = ["read", undefined, docId, context]
    await runHooks("preOperation", globalConfig, customization, preOperationArgs)
    const preReadArgs: PreReadHookArgs = [context, refs, false, false]
    await runHooks("preRead", globalConfig, customization, preReadArgs)

    let docData = {} as StokerRecord

    const snapshotPromises = refs.map(async (ref) => {
        let snapshot
        if (options?.only === "cache") snapshot = await getDocFromCache(ref)
        else if (options?.only === "server") snapshot = await getDocFromServer(ref)
        else snapshot = await getDoc(ref)
        if (!snapshot.exists())
            throw new Error(
                `NOT_FOUND: Document with ID ${docId} does not exist at location ${path?.join("/") || labels.collection}`,
            )
        return { id: snapshot.id, data: snapshot.data({ serverTimestamps: serverTimestampOptions || "none" }) }
    })

    const snapshots = await Promise.all(snapshotPromises)
    for (const doc of snapshots) {
        docData.id ||= doc.id
        docData = { ...docData, ...doc.data }
        delete docData.Collection_Path_String
    }

    const operations = []
    const documentPath = path ? [...path, docId] : [labels.collection, docId]
    if (options?.subcollections) {
        operations.push(
            getSubcollections(
                docData,
                documentPath,
                cloneDeep(options.subcollections),
                schema,
                cloneDeep(options?.relations),
                options?.only,
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
                docData,
                documentPath,
                cloneDeep(options.relations) as { fields: CollectionField[]; depth: number },
                schema,
                options?.only,
                options?.noComputedFields,
                options?.noEmbeddingFields,
            ),
        )
    }
    await Promise.all(operations)

    if (!options?.noComputedFields) {
        for (const field of collectionSchema.fields) {
            if (field.type === "Computed") {
                docData[field.name] = await field.formula(docData)
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

    const postOperationArgs: PostOperationHookArgs = ["read", docData, docId, context]
    await runHooks("postOperation", globalConfig, customization, postOperationArgs)
    const postReadArgs: PostReadHookArgs = [context, refs, docData, false]
    await runHooks("postRead", globalConfig, customization, postReadArgs)

    return docData
}

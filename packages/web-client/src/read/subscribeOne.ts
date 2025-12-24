import { Unsubscribe, onSnapshot, onSnapshotsInSync, getFirestore } from "firebase/firestore"
import {
    CollectionField,
    PostOperationHookArgs,
    PostReadHookArgs,
    PreOperationHookArgs,
    PreReadHookArgs,
    StokerRecord,
    StokerRelation,
} from "@stoker-platform/types"
import { getDocumentRefs } from "./getDocumentRefs"
import {
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getCurrentUserRoleGroups,
    getGlobalConfigModule,
    getSchema,
} from "../initializeStoker"
import cloneDeep from "lodash/cloneDeep.js"
import {
    getCachedConfigValue,
    getRelatedCollections,
    isRelationField,
    removeDeletedFields,
    runHooks,
    tryPromise,
    updateFieldReference,
} from "@stoker-platform/utils"
import { getOne } from "./getOne"

export const subscribeOne = async (
    path: string[],
    docId: string,
    callback: (docData: StokerRecord | undefined) => void,
    errorCallback?: (error: Error) => void,
    options?: {
        only?: "cache" | "default"
        relations?:
            | boolean
            | {
                  fields: (string | CollectionField)[]
              }
        noComputedFields?: boolean
        noEmbeddingFields?: boolean
    },
) => {
    const collection = path.at(-1)
    if (!collection) throw new Error("EMPTY_PATH")
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSIONS_NOT_FOUND")
    const schema = getSchema(true)
    const roleGroups = getCurrentUserRoleGroups()
    // eslint-disable-next-line security/detect-object-injection
    const roleGroup = roleGroups[collection]
    const db = getFirestore()
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    if (!collectionSchema) throw new Error("COLLECTION_NOT_FOUND")
    const { labels, preloadCache } = collectionSchema
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
    const refs = getDocumentRefs(path, docId, roleGroup)
    if (refs.length === 0) throw new Error("PERMISSION_DENIED")
    const isPreloadCacheEnabled = preloadCache?.roles?.includes(permissions.Role)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context: any = { collection: labels.collection }
    const preOperationArgs: PreOperationHookArgs = ["read", undefined, docId, context]
    await runHooks("preOperation", globalConfig, customization, preOperationArgs)
    const preReadArgs: PreReadHookArgs = [context, refs, false, true]
    await runHooks("preRead", globalConfig, customization, preReadArgs)

    const loaded = new Map()
    const listeners: Unsubscribe[] = []
    let docData = {} as StokerRecord | undefined
    const fieldReferences = new Map()

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

    const callbackWhenInSync = () => {
        const unsubscribe = onSnapshotsInSync(db, async () => {
            unsubscribe()
            if (docData) {
                removeDeletedFields(docData, fieldReferences)

                if (!options?.noComputedFields) {
                    const computedPromises = []
                    for (const field of collectionSchema.fields) {
                        if (field.type === "Computed") {
                            computedPromises.push(
                                tryPromise(() => field.formula(docData as StokerRecord)).then((value) => {
                                    if (docData) {
                                        docData[field.name] = value
                                    }
                                }),
                            )
                        }
                    }
                    await Promise.all(computedPromises)
                }
                if (options?.noEmbeddingFields) {
                    for (const field of collectionSchema.fields) {
                        if (field.type === "Embedding") {
                            delete docData[field.name]
                        }
                    }
                }
            }
            callback(cloneDeep(docData))
        })
    }

    const relationsInitialized = new Map()
    const relationListeners = new Map()

    const getRelationFields = (relations: boolean | { fields: (string | CollectionField)[] }) => {
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
        return fields
    }

    const getRelations = () => {
        return new Promise((resolve) => {
            if (!options?.relations) {
                resolve({})
                return
            }
            const relations = cloneDeep(options.relations)

            const relationsLoaded = new Map()
            const alreadyInitialized = new Map()

            const fields = getRelationFields(relations)
            for (const field of fields as CollectionField[]) {
                for (const relation of relationListeners.values()) {
                    if (
                        relation.type === field.type &&
                        relation.field === field.name &&
                        // eslint-disable-next-line security/detect-object-injection
                        !(docData as StokerRecord)[field.name][relation.id]
                    ) {
                        relation.listener()
                        relationsInitialized.delete(`${field.name}_${relation.id}`)
                    }
                }
            }
            for (const field of fields as CollectionField[]) {
                if ("collection" in field) {
                    // eslint-disable-next-line security/detect-object-injection
                    const relationObject = (docData as StokerRecord)[field.name]
                    if (!relationObject) continue
                    for (const id of Object.keys(relationObject)) {
                        // eslint-disable-next-line security/detect-object-injection
                        if (!relationObject?.[id].id) {
                            relationsLoaded.set(`${field.name}_${id}`, false)
                            if (!relationsInitialized.has(`${field.name}_${id}`)) {
                                relationsInitialized.set(`${field.name}_${id}`, true)
                            } else {
                                alreadyInitialized.set(`${field.name}_${id}`, true)
                            }
                        }
                    }
                }
            }
            if (relationsLoaded.size === 0) resolve({})
            else {
                for (const field of fields as CollectionField[]) {
                    if ("collection" in field) {
                        // eslint-disable-next-line security/detect-object-injection
                        const relationObject = (docData as StokerRecord)[field.name]
                        if (!relationObject) continue
                        for (const [id, relation] of Object.entries(relationObject)) {
                            if (alreadyInitialized.has(`${field.name}_${id}`)) {
                                const getValue = async () => {
                                    // eslint-disable-next-line security/detect-object-injection
                                    if (relationObject[id].id) {
                                        relationsLoaded.set(`${field.name}_${id}`, true)
                                        if (Array.from(relationsLoaded.values()).every((value) => value)) {
                                            resolve({})
                                            callbackWhenInSync()
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
                                            if (!relationObject?.[id]) {
                                                if (relationListeners.get(`${field.name}_${id}`)) {
                                                    relationListeners.get(`${field.name}_${id}`).listener()
                                                }
                                                relationsLoaded.set(`${field.name}_${id}`, true)
                                                relationsInitialized.delete(`${field.name}_${id}`)
                                                return
                                            }
                                            // eslint-disable-next-line security/detect-object-injection
                                            relationObject[id] = relatedDocument

                                            relationsLoaded.set(`${field.name}_${id}`, true)
                                            if (Array.from(relationsLoaded.values()).every((value) => value)) {
                                                resolve({})
                                                callbackWhenInSync()

                                                const postOperationArgs: PostOperationHookArgs = [
                                                    "read",
                                                    docData as StokerRecord,
                                                    docId,
                                                    context,
                                                ]
                                                runHooks(
                                                    "postOperation",
                                                    globalConfig,
                                                    customization,
                                                    postOperationArgs,
                                                )
                                                const postReadArgs: PostReadHookArgs = [
                                                    context,
                                                    refs,
                                                    docData as StokerRecord,
                                                    true,
                                                ]
                                                runHooks("postRead", globalConfig, customization, postReadArgs)
                                            }
                                        },
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        (error: any) => {
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
                                        },
                                        { ...options, relations: false },
                                    ).then((unsubscribe) => {
                                        // eslint-disable-next-line security/detect-object-injection
                                        if (!relationObject?.[id]) {
                                            unsubscribe()
                                            relationsInitialized.delete(`${field.name}_${id}`)
                                            return
                                        }
                                        listeners.push(unsubscribe)
                                        relationListeners.set(`${field.name}_${id}`, {
                                            id,
                                            type: field.type,
                                            field: field.name,
                                            listener: unsubscribe,
                                        })
                                    })
                                } else {
                                    getOne([...(relation as StokerRelation).Collection_Path], id, {
                                        noComputedFields: options?.noComputedFields,
                                        noEmbeddingFields: options?.noEmbeddingFields,
                                    })
                                        .then((relatedDocument) => {
                                            if (!relatedDocument) {
                                                // eslint-disable-next-line security/detect-object-injection
                                                delete relationObject[id]
                                                return
                                            }
                                            // eslint-disable-next-line security/detect-object-injection
                                            if (!relationObject?.[id]) {
                                                relationsLoaded.set(`${field.name}_${id}`, true)
                                                relationsInitialized.delete(`${field.name}_${id}`)
                                                return
                                            }
                                            // eslint-disable-next-line security/detect-object-injection
                                            relationObject[id] = relatedDocument

                                            relationsLoaded.set(`${field.name}_${id}`, true)
                                            if (Array.from(relationsLoaded.values()).every((value) => value)) {
                                                resolve({})
                                                callbackWhenInSync()

                                                const postOperationArgs: PostOperationHookArgs = [
                                                    "read",
                                                    docData as StokerRecord,
                                                    docId,
                                                    context,
                                                ]
                                                runHooks(
                                                    "postOperation",
                                                    globalConfig,
                                                    customization,
                                                    postOperationArgs,
                                                )
                                                const postReadArgs: PostReadHookArgs = [
                                                    context,
                                                    refs,
                                                    docData as StokerRecord,
                                                    true,
                                                ]
                                                runHooks("postRead", globalConfig, customization, postReadArgs)
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
        })
    }

    for (const ref of refs) {
        const listener = onSnapshot(
            ref,
            { source: options?.only || (isPreloadCacheEnabled ? "cache" : "default") },
            (snapshot) => {
                if (snapshot.exists()) {
                    const update = snapshot.data({ serverTimestamps: serverTimestampOptions || "none" }) as StokerRecord
                    if (loaded.has(ref.path) && options?.relations) {
                        const fields = getRelationFields(options?.relations)
                        for (const field of fields as CollectionField[]) {
                            if ("collection" in field && update[field.name]) {
                                update[field.name] = docData?.[field.name]
                            }
                        }
                    }
                    loaded.set(ref.path, true)
                    docData ||= {} as StokerRecord
                    docData.id ||= snapshot.id
                    docData = { ...docData, ...update }
                    delete docData.Collection_Path_String

                    const fieldReference: Set<string> = fieldReferences.get(ref) || new Set()
                    updateFieldReference(update, fieldReference)
                    fieldReferences.set(ref, fieldReference)

                    if (loaded.size === refs.length) {
                        getRelations().then(() => {
                            callbackWhenInSync()

                            const postOperationArgs: PostOperationHookArgs = [
                                "read",
                                docData as StokerRecord,
                                docId,
                                context,
                            ]
                            runHooks("postOperation", globalConfig, customization, postOperationArgs)
                            const postReadArgs: PostReadHookArgs = [context, refs, docData as StokerRecord, true]
                            runHooks("postRead", globalConfig, customization, postReadArgs)
                        })
                    }
                } else if (docData) {
                    docData = undefined

                    callbackWhenInSync()

                    const postOperationArgs: PostOperationHookArgs = ["read", undefined, docId, context]
                    runHooks("postOperation", globalConfig, customization, postOperationArgs)
                    const postReadArgs: PostReadHookArgs = [context, refs, undefined, true]
                    runHooks("postRead", globalConfig, customization, postReadArgs)
                }
            },
            (error) => {
                if (errorCallback) {
                    errorCallback(error)
                }
                listeners.forEach((listener) => listener())
            },
        )
        listeners.push(listener)
    }

    return () => {
        listeners.forEach((listener) => listener())
    }
}

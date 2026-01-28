import { uniqueValidation } from "./uniqueValidation.js"
import { writeLog } from "./writeLog.js"
import { DocumentSnapshot, FieldValue, getFirestore, Timestamp, Transaction } from "firebase-admin/firestore"
import {
    addSystemFields,
    validateRecord,
    addRelationArrays,
    addDenormalized,
    runHooks,
    tryPromise,
    removeUndefined,
    isValidUniqueFieldValue,
    updateRecordAccessControl,
    retryOperation,
    isDeleteSentinel,
    isRelationField,
    removeDeleteSentinels,
    addLowercaseFields,
    getAllRoleGroups,
    getFieldCustomization,
} from "@stoker-platform/utils"
import {
    CollectionField,
    RelationField,
    StokerCollection,
    PostOperationHookArgs,
    PostWriteHookArgs,
    PreOperationHookArgs,
    PreWriteHookArgs,
    StokerRecord,
    PostWriteErrorHookArgs,
    StokerRole,
    StokerPermissions,
    CollectionSchema,
    CollectionsSchema,
} from "@stoker-platform/types"
import { getFirestorePathRef } from "../utils/getFirestorePathRef.js"
import cloneDeep from "lodash/cloneDeep.js"
import { getOne } from "../read/getOne.js"
import { getGlobalConfigModule, getCustomizationFile, getTenant } from "../initializeStoker.js"
import { validateCollectionPath } from "../utils/validateCollectionPath.js"
import { updateUser } from "./updateUser.js"
import { deleteUser } from "./deleteUser.js"
import { lockRecord, unlockRecord } from "./lockRecord.js"
import { getAuth, UserRecord } from "firebase-admin/auth"
import { rollbackUser } from "./rollbackUser.js"
import { deserializeDeleteSentinels } from "../utils/deserializeDeleteSentinels.js"
import { deserializeTimestamps } from "../utils/deserializeTimestamps.js"
import { validateRelations } from "./validateRelations.js"
import { validateSystemFields } from "./validateSystemFields.js"
import { validateSoftDelete } from "./validateSoftDelete.js"
import { fetchCurrentSchema } from "../utils/fetchSchema.js"
import { getDocumentRefs } from "../read/getDocumentRefs.js"
import { entityRestrictionAccess } from "./entityRestrictionAccess.js"

export const updateRecord = async (
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
    originalRecord?: StokerRecord,
) => {
    const tenantId = getTenant()
    const globalConfig = getGlobalConfigModule()
    if (options?.providedTransaction && userId) {
        throw new Error("PERMISSION_DENIED")
    }
    if (options?.providedSchema && userId) {
        throw new Error("PERMISSION_DENIED")
    }
    if (options?.providedTransaction && !originalRecord) {
        throw new Error("PERMISSION_DENIED")
    }
    let schema = options?.providedSchema || (await fetchCurrentSchema(true))
    if (path.length === 0) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionName: StokerCollection = path.at(-1)!
    const collectionFound = Object.keys(schema.collections).includes(collectionName)
    const collectionDisabled = globalConfig.disabledCollections?.includes(collectionName)
    if (!collectionFound || collectionDisabled) throw new Error("COLLECTION_NOT_FOUND")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema: CollectionSchema = schema.collections[collectionName]
    const { labels, fields, enableWriteLog } = collectionSchema
    const customization = getCustomizationFile(labels.collection, schema)
    const appName = await tryPromise(globalConfig.appName)

    const auth = getAuth()
    const db = getFirestore()

    let currentUserPermissions: StokerPermissions | undefined
    if (userId) {
        await validateCollectionPath(path, collectionSchema)
    }

    const ref = getFirestorePathRef(db, path, tenantId)

    context = context || {}
    context.collection = labels.collection

    originalRecord =
        originalRecord ||
        (await getOne(path, docId, {
            user: userId,
            noComputedFields: true,
            noEmbeddingFields: true,
        }))

    for (const field of fields) {
        if (field.type === "Computed") {
            delete data[field.name]
        }
    }

    schema = {
        ...schema,
        collections: Object.fromEntries(
            Object.entries(schema.collections).map(([key, collection]) => [
                key,
                {
                    ...collection,
                    fields: collection.fields.filter((field) => field.type !== "Computed"),
                },
            ]),
        ),
    }

    if (user && !user.operation) {
        throw new Error("VALIDATION_ERROR: User operation is required")
    }
    if (user && !collectionSchema.auth) {
        throw new Error("VALIDATION_ERROR: User operations are only permitted for auth collections")
    }
    if (user?.operation === "delete" && user.permissions) {
        throw new Error("VALIDATION_ERROR: Permissions are not allowed for delete operations")
    }

    const createUserRequest = collectionSchema.auth && user?.operation === "create"
    const deleteUserRequest = collectionSchema.auth && user?.operation === "delete"
    const updateUserRequest =
        collectionSchema.auth &&
        !createUserRequest &&
        !deleteUserRequest &&
        (user?.operation === "update" ||
            data.Role ||
            data.Enabled !== undefined ||
            data.Name ||
            data.Email ||
            data.Photo_URL)
    const updateUserRequired = (originalRecord: StokerRecord) => {
        return (
            originalRecord.User_ID &&
            ((collectionSchema.auth && !createUserRequest && !deleteUserRequest && user?.operation === "update") ||
                (data.Role && data.Role !== originalRecord.Role) ||
                (data.Enabled !== undefined && data.Enabled !== originalRecord.Enabled) ||
                (data.Name && data.Name !== originalRecord.Name) ||
                (data.Email && data.Email !== originalRecord.Email) ||
                (data.Photo_URL && data.Photo_URL !== originalRecord.Photo_URL))
        )
    }

    delete data.id

    deserializeTimestamps(data)
    deserializeDeleteSentinels(data)

    const partial: StokerRecord = addSystemFields(
        "update",
        path,
        data,
        schema,
        appName,
        "Online",
        userId || "System",
        Timestamp.now(),
        FieldValue.serverTimestamp(),
    )
    const originalSystemFields = cloneDeep(partial)

    for (const field of fields) {
        if (!isRelationField(field) && isDeleteSentinel(partial[field.name]) && field.nullable) {
            partial[field.name] = null
        }
    }

    removeUndefined(partial)
    removeUndefined(originalRecord)

    if (enableWriteLog && !options?.providedTransaction)
        await writeLog("update", "started", partial, tenantId, path, docId, collectionSchema, undefined, originalRecord)

    const preOperationArgs: PreOperationHookArgs = [
        "update",
        partial,
        docId,
        context,
        undefined,
        cloneDeep(originalRecord),
    ]
    await runHooks("preOperation", globalConfig, customization, preOperationArgs)
    const preWriteArgs: PreWriteHookArgs = ["update", partial, docId, context, undefined, cloneDeep(originalRecord)]
    await runHooks("preWrite", globalConfig, customization, preWriteArgs)

    addRelationArrays(collectionSchema, partial, schema)
    addLowercaseFields(collectionSchema, partial)

    removeUndefined(partial)

    try {
        if (createUserRequest) {
            if (!user.password) throw new Error("Password is required")
        }
        if (!options?.providedTransaction) {
            const record = { ...originalRecord, ...partial }
            await uniqueValidation("update", tenantId, docId, record, collectionSchema, schema)
            removeDeleteSentinels(record)
            await validateRecord(
                "update",
                record,
                collectionSchema,
                customization,
                ["update", partial, context, undefined, cloneDeep(originalRecord)],
                schema,
            )
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        throw new Error(`VALIDATION_ERROR: ${error.message}`)
    }

    removeUndefined(partial)

    delete data.id
    addRelationArrays(collectionSchema, partial, schema)
    addLowercaseFields(collectionSchema, partial)
    for (const field of fields) {
        if (!isRelationField(field) && isDeleteSentinel(partial[field.name]) && field.nullable) {
            partial[field.name] = null
        }
    }
    try {
        const record = { ...originalRecord, ...partial }
        removeDeleteSentinels(record)
        validateSoftDelete("update", collectionSchema, partial, originalRecord)
        validateSystemFields("update", partial, originalSystemFields)
        await validateRecord(
            "update",
            record,
            collectionSchema,
            customization,
            ["update", partial, context, undefined, originalRecord],
            schema,
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        throw new Error(`VALIDATION_ERROR: ${error.message}`)
    }

    let originalPermissions: StokerPermissions | undefined
    if (user) {
        user.permissions ||= {} as StokerPermissions
    }

    const preWriteChecks = async (transaction: Transaction, initial?: boolean, batchSize?: { size: number }) => {
        const [latestDeploy, maintenanceMode, latestOriginalRecord, permissionsSnapshot, latestSchema] =
            await Promise.all([
                !options?.providedTransaction
                    ? transaction.get(db.collection("system_deployment").doc("latest_deploy"))
                    : Promise.resolve({} as DocumentSnapshot),
                !options?.providedTransaction
                    ? transaction.get(db.collection("system_deployment").doc("maintenance_mode"))
                    : Promise.resolve({} as DocumentSnapshot),
                !options?.providedTransaction
                    ? getOne(path, docId, {
                          user: userId,
                          providedTransaction: transaction,
                          noComputedFields: true,
                      })
                    : Promise.resolve(originalRecord),
                userId
                    ? transaction.get(
                          db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(userId),
                      )
                    : Promise.resolve({} as DocumentSnapshot),
                !options?.providedSchema ? fetchCurrentSchema() : Promise.resolve(options.providedSchema),
            ])
        if (batchSize) batchSize.size += 3

        if (!options?.providedTransaction) {
            if (!latestDeploy.exists) throw new Error("VERSION_ERROR")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const deploy = latestDeploy.data()!
            if (deploy.force && partial.Last_Write_At.valueOf() < deploy.time.valueOf())
                throw new Error("VERSION_ERROR")

            if (!maintenanceMode.exists) throw new Error("MAINTENANCE_MODE")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const maintenance = maintenanceMode.data()!
            if (maintenance.active) throw new Error("MAINTENANCE_MODE")
        }

        if (!latestOriginalRecord) throw new Error("NOT_FOUND")
        originalRecord = latestOriginalRecord as StokerRecord

        schema = latestSchema

        if (userId) {
            if (!permissionsSnapshot?.exists) throw new Error("PERMISSION_DENIED")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            currentUserPermissions = permissionsSnapshot.data()!
            if (!currentUserPermissions.Role) throw new Error("USER_ERROR")
            if (!currentUserPermissions.Enabled) throw new Error("PERMISSION_DENIED")
        }

        if (batchSize) batchSize.size += getDocumentRefs(tenantId, path, docId, schema, currentUserPermissions).length

        if ((createUserRequest && originalRecord.User_ID) || (deleteUserRequest && !originalRecord.User_ID)) {
            throw new Error("USER_ERROR")
        }

        if (updateUserRequired(originalRecord)) {
            const originalPermissionsSnapshot = await transaction.get(
                db
                    .collection("tenants")
                    .doc(tenantId)
                    .collection("system_user_permissions")
                    .doc(originalRecord.User_ID),
            )
            if (batchSize) batchSize.size++
            if (!originalPermissionsSnapshot?.exists) throw new Error("PERMISSION_DENIED")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            originalPermissions = originalPermissionsSnapshot.data()!
            if (user?.permissions) {
                user.permissions.Role ||= partial.Role || originalRecord.Role
                user.permissions.Enabled ??= partial.Enabled ?? originalRecord.Enabled
                if (isDeleteSentinel(user.permissions.Role)) {
                    throw new Error("VALIDATION_ERROR: Role field is required")
                }
                if (isDeleteSentinel(user.permissions.Enabled)) {
                    throw new Error("VALIDATION_ERROR: Enabled field is required")
                }
            }
        }

        if (!options?.providedTransaction) {
            const uniqueFields = fields.filter((field) => "unique" in field && field.unique)
            const uniqueFieldPromises = uniqueFields.map(async (field) => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (!userId || !field.access || field.access.includes(currentUserPermissions!.Role!)) {
                    if (partial[field.name] === undefined || isDeleteSentinel(partial[field.name])) return
                    const fieldCustomization = getFieldCustomization(field, customization)
                    const finalRecord = { ...originalRecord, ...partial }
                    const allowField =
                        userId && fieldCustomization?.custom?.serverAccess?.read !== undefined
                            ? await tryPromise(fieldCustomization.custom.serverAccess.read, [
                                  currentUserPermissions?.Role,
                                  finalRecord,
                              ])
                            : true
                    if (!allowField) throw new Error("PERMISSION_DENIED")
                    const fieldName = partial[field.name]
                        .toString()
                        .toLowerCase()
                        .replace(/\s/g, "---")
                        .replaceAll("/", "|||")
                    if (!isValidUniqueFieldValue(fieldName)) {
                        throw new Error(`VALIDATION_ERROR: ${field.name} "${partial[field.name]}" is invalid`)
                    } else {
                        if (batchSize) batchSize.size++
                        if (batchSize && batchSize.size > 500) {
                            throw new Error(
                                `VALIDATION_ERROR: The number of operations in the Firestore transaction has exceeded the limit of 500. This is likely due to a large number of unique field checks.`,
                            )
                        }
                        const unique = await transaction.get(
                            db
                                .collection("tenants")
                                .doc(tenantId)
                                .collection("system_unique")
                                .doc(labels.collection)
                                .collection(`Unique-${labels.collection}-${field.name}`)
                                .doc(fieldName),
                        )
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        if (unique.exists && !(unique.data()!.id === docId))
                            throw new Error(`VALIDATION_ERROR: ${field.name} "${partial[field.name]}" already exists`)
                    }
                }
            })
            await Promise.all(uniqueFieldPromises)
        }

        if (userId && currentUserPermissions?.Role) {
            const role = currentUserPermissions.Role
            const finalRecord = { ...originalRecord, ...partial }
            const allowedCollection =
                customization.custom?.serverAccess?.update !== undefined
                    ? await tryPromise(customization.custom.serverAccess.update, [role, finalRecord, originalRecord])
                    : true
            if (!allowedCollection) throw new Error("PERMISSION_DENIED")
            for (const field of collectionSchema.fields) {
                const fieldCustomization = getFieldCustomization(field, customization)
                const isFieldUpdated = Object.prototype.hasOwnProperty.call(partial, field.name)
                if (!isFieldUpdated) continue
                if (fieldCustomization?.custom?.serverAccess?.update !== undefined) {
                    const allowedField = await tryPromise(fieldCustomization.custom.serverAccess.update, [
                        role,
                        finalRecord,
                        originalRecord,
                    ])
                    if (!allowedField) throw new Error("PERMISSION_DENIED")
                }
            }
        }

        updateRecordAccessControl(
            partial,
            originalRecord,
            docId,
            collectionSchema,
            schema,
            userId,
            currentUserPermissions,
            user?.operation ? user.operation : updateUserRequest ? "update" : undefined,
            user?.permissions,
            originalPermissions,
        )

        if (user?.permissions && userId && currentUserPermissions) {
            await entityRestrictionAccess(
                transaction,
                user.permissions,
                userId,
                currentUserPermissions,
                schema,
                originalPermissions,
                batchSize,
            )
        }

        updateRecordAccessControl(
            partial,
            originalRecord,
            docId,
            collectionSchema,
            schema,
            userId,
            currentUserPermissions,
            user?.operation ? user.operation : updateUserRequest ? "update" : undefined,
            user?.permissions,
            originalPermissions,
        )

        if (initial && (createUserRequest || updateUserRequired(originalRecord) || deleteUserRequest)) {
            await lockRecord(transaction, docId, originalRecord.User_ID)
        }
    }

    // Keep the user transaction out of the try block to avoid unlocking the record if write permission is denied

    if (createUserRequest || updateUserRequest || deleteUserRequest) {
        await db.runTransaction(
            async (transaction) => {
                await preWriteChecks(transaction, true)
            },
            { maxAttempts: 10 },
        )
    }

    const runTransaction = async (transaction: Transaction, originalUser: UserRecord | undefined) => {
        if (!originalRecord) throw new Error("NOT_FOUND")
        try {
            const batchSize = { size: 1 }
            const record = { ...originalRecord, ...partial }

            await preWriteChecks(transaction, false, batchSize)

            let noDelete: Map<string, string[]> | undefined
            if (!options?.noTwoWay && !options?.providedTransaction) {
                noDelete = await validateRelations(
                    "Update",
                    tenantId,
                    docId,
                    record,
                    partial,
                    collectionSchema,
                    schema,
                    transaction,
                    batchSize,
                    userId,
                    currentUserPermissions,
                    originalRecord,
                )
            }

            const roleGroups = getAllRoleGroups(schema)
            addDenormalized(
                "update",
                transaction,
                path,
                docId,
                partial,
                schema,
                collectionSchema,
                options,
                roleGroups,
                FieldValue.arrayUnion,
                FieldValue.arrayRemove,
                FieldValue.delete,
                (field: CollectionField) =>
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(labels.collection)
                        .collection(`${labels.collection}-${field.name}`)
                        .doc(docId),
                (field: CollectionField, uniqueValue: string) =>
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_unique")
                        .doc(labels.collection)
                        .collection(`Unique-${labels.collection}-${field.name}`)
                        .doc(uniqueValue),
                (role: StokerRole) =>
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(labels.collection)
                        .collection(`${labels.collection}-${role}`)
                        .doc(docId),
                (relationPath: string[], id: string) => {
                    const ref = getFirestorePathRef(db, relationPath, tenantId)
                    return ref.doc(id)
                },
                (field: RelationField, dependencyField: string, id: string) =>
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(field.collection)
                        .collection(`${field.collection}-${dependencyField}`)
                        .doc(id),
                (field: RelationField, role: StokerRole, id: string) =>
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(field.collection)
                        .collection(`${field.collection}-${role.replaceAll(" ", "-")}`)
                        .doc(id),
                originalRecord,
                noDelete,
                batchSize,
            )

            transaction.update(ref.doc(docId), partial)
        } catch (error) {
            if (!options?.providedTransaction) {
                const postWriteErrorArgs: PostWriteErrorHookArgs = [
                    "update",
                    partial,
                    docId,
                    context,
                    error,
                    undefined,
                    undefined,
                    cloneDeep(originalRecord),
                ]
                const errorHook = await runHooks("postWriteError", globalConfig, customization, postWriteErrorArgs)
                if (enableWriteLog) {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 250)
                    })
                    await writeLog(
                        "update",
                        errorHook?.resolved ? "success" : "failed",
                        partial,
                        tenantId,
                        path,
                        docId,
                        collectionSchema,
                        errorHook?.resolved ? undefined : error,
                        originalRecord,
                    )
                }
                if (!errorHook?.resolved) {
                    if (createUserRequest) {
                        await deleteUser(originalRecord)
                    }
                    if (updateUserRequired(originalRecord)) {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        await rollbackUser(originalRecord.User_ID, originalUser!, originalPermissions!, "USER_ERROR")
                    }
                    if (deleteUserRequest) {
                        await db
                            .collection("tenants")
                            .doc(tenantId)
                            .collection(labels.collection)
                            .doc(docId)
                            .update({ User_ID: FieldValue.delete() })
                    }
                    throw error
                }
            } else throw error
        }
        if (createUserRequest || updateUserRequired(originalRecord) || deleteUserRequest) {
            await retryOperation(unlockRecord, [docId, originalRecord.User_ID]).catch(() => {
                throw new Error("USER_ERROR")
            })
        }
    }

    try {
        let originalUser: UserRecord | undefined
        if (createUserRequest || updateUserRequired(originalRecord) || deleteUserRequest) {
            if (updateUserRequired(originalRecord)) {
                originalUser = await auth.getUser(originalRecord.User_ID)
                const claims = originalUser.customClaims
                if (!(claims && claims.role && claims.collection && claims.doc)) {
                    throw new Error("USER_ERROR")
                }
            }
            const record = { ...originalRecord, ...partial }
            removeDeleteSentinels(record)
            const uid = await updateUser(
                user?.operation || "update",
                tenantId,
                docId,
                globalConfig,
                labels.collection,
                record,
                originalRecord,
                originalUser,
                user?.permissions,
                originalPermissions,
                user?.password,
            )
            if (createUserRequest) {
                partial.User_ID = uid
            }
            if (deleteUserRequest) {
                partial.User_ID = FieldValue.delete()
            }
        }

        if (options?.providedTransaction) {
            await runTransaction(options.providedTransaction, originalUser)
        } else {
            await db.runTransaction(
                async (transaction) => {
                    await runTransaction(transaction, originalUser)
                },
                { maxAttempts: 10 },
            )
        }
    } catch (error) {
        if (createUserRequest || updateUserRequired(originalRecord) || deleteUserRequest) {
            await retryOperation(unlockRecord, [docId, originalRecord.User_ID]).catch(() => {
                throw new Error("USER_ERROR")
            })
        }
        throw error
    }

    if (!options?.providedTransaction) {
        const postWriteArgs: PostWriteHookArgs = [
            "update",
            partial,
            docId,
            context,
            undefined,
            cloneDeep(originalRecord),
        ]
        const postOperationArgs: PostOperationHookArgs = [...postWriteArgs]
        await runHooks("postWrite", globalConfig, customization, postWriteArgs)
        await runHooks("postOperation", globalConfig, customization, postOperationArgs)
    }

    const finalRecord = { ...originalRecord, ...partial }
    removeDeleteSentinels(finalRecord)
    const result = { id: docId, ...finalRecord }
    return result
}

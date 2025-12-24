import { uniqueValidation } from "./uniqueValidation.js"
import { writeLog } from "./writeLog.js"
import { DocumentSnapshot, FieldValue, getFirestore, Timestamp, Transaction } from "firebase-admin/firestore"
import {
    addSystemFields,
    validateRecord,
    addRelationArrays,
    addInitialValues,
    addDenormalized,
    runHooks,
    tryPromise,
    removeUndefined,
    isValidUniqueFieldValue,
    addRecordAccessControl,
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
} from "@stoker-platform/types"
import { getFirestorePathRef } from "../utils/getFirestorePathRef.js"
import { addUser } from "./addUser.js"
import { getCustomizationFile, getGlobalConfigModule, getTenant } from "../initializeStoker.js"
import { validateCollectionPath } from "../utils/validateCollectionPath.js"
import { deleteUser } from "./deleteUser.js"
import { deserializeTimestamps } from "../utils/deserializeTimestamps.js"
import { deserializeDeleteSentinels } from "../utils/deserializeDeleteSentinels.js"
import { validateRelations } from "./validateRelations.js"
import cloneDeep from "lodash/cloneDeep.js"
import { validateSystemFields } from "./validateSystemFields.js"
import { getAuth } from "firebase-admin/auth"
import { fetchCurrentSchema } from "../utils/fetchSchema.js"
import { validateSoftDelete } from "./validateSoftDelete.js"
import { entityRestrictionAccess } from "./entityRestrictionAccess.js"

export const addRecord = async (
    path: string[],
    data: Partial<StokerRecord>,
    user?: {
        password: string
        permissions?: StokerPermissions
    },
    userId?: string,
    options?: {
        noTwoWay?: boolean
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
    id?: string,
) => {
    const tenantId = getTenant()
    const globalConfig = getGlobalConfigModule()
    let schema = await fetchCurrentSchema()
    if (path.length === 0) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionName: StokerCollection = path.at(-1)!
    const collectionFound = Object.keys(schema.collections).includes(collectionName)
    const collectionDisabled = globalConfig.disabledCollections?.includes(collectionName)
    if (!collectionFound || collectionDisabled) throw new Error("COLLECTION_NOT_FOUND")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema: CollectionSchema = schema.collections[collectionName]
    const { labels, fields, enableWriteLog, softDelete } = collectionSchema
    const customization = getCustomizationFile(labels.collection, schema)
    const appName = await tryPromise(globalConfig.appName)

    const db = getFirestore()
    const auth = getAuth()
    const currentUser = userId ? await auth.getUser(userId) : undefined
    const currentUserRole = currentUser?.customClaims?.role

    let currentUserPermissions: StokerPermissions | undefined
    if (userId) {
        await validateCollectionPath(path, collectionSchema)
    }

    const ref = getFirestorePathRef(db, path, tenantId)
    const docId = id || ref.doc().id

    context = context || {}
    context.collection = labels.collection

    data.id = docId

    deserializeTimestamps(data)
    deserializeDeleteSentinels(data)

    const record: StokerRecord = addSystemFields(
        "create",
        path,
        data,
        schema,
        appName,
        "Online",
        userId || "System",
        Timestamp.now(),
        FieldValue.serverTimestamp(),
    )
    const originalSystemFields = cloneDeep(record)

    if (softDelete) {
        record[softDelete.archivedField] = false
    }

    removeUndefined(data)

    if (enableWriteLog) await writeLog("create", "started", record, tenantId, path, docId, collectionSchema)

    const preOperationArgs: PreOperationHookArgs = ["create", record, docId, context]
    await runHooks("preOperation", globalConfig, customization, preOperationArgs)
    const preWriteArgs: PreWriteHookArgs = ["create", record, docId, context]
    await runHooks("preWrite", globalConfig, customization, preWriteArgs)

    addRelationArrays(collectionSchema, record, schema)
    addLowercaseFields(collectionSchema, record)
    await addInitialValues(record, collectionSchema, customization, currentUserRole)

    removeUndefined(record)

    try {
        if (collectionSchema.auth && user) {
            if (!user.password) throw new Error("Password is required")
        }
        await uniqueValidation("create", tenantId, docId, record, collectionSchema, schema)
        await validateRecord("create", record, collectionSchema, customization, ["create", record, context], schema)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        throw new Error(`VALIDATION_ERROR: ${error.message}`)
    }

    removeUndefined(record)

    data.id = docId
    if (softDelete) {
        record[softDelete.archivedField] = false
    }
    addRelationArrays(collectionSchema, record, schema)
    addLowercaseFields(collectionSchema, record)
    try {
        validateSystemFields("create", record, originalSystemFields)
        validateSoftDelete("create", collectionSchema, record)
        await validateRecord("create", record, collectionSchema, customization, ["create", record, context], schema)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        throw new Error(`VALIDATION_ERROR: ${error.message}`)
    }

    if (userId) {
        const role = currentUserRole as string | undefined
        if (!role) throw new Error("USER_ERROR")
        const allowedCollection =
            customization.custom?.serverAccess?.create !== undefined
                ? await tryPromise(customization.custom.serverAccess.create, [role, record])
                : true
        if (!allowedCollection) throw new Error("PERMISSION_DENIED")
        for (const field of collectionSchema.fields) {
            if (!(field.name in record)) continue
            const fieldCustomization = getFieldCustomization(field, customization)
            if (fieldCustomization?.custom?.serverAccess?.create !== undefined) {
                const allowedField = await tryPromise(fieldCustomization.custom.serverAccess.create, [role, record])
                if (!allowedField) throw new Error("PERMISSION_DENIED")
            }
        }
    }

    if (user) {
        user.permissions ||= {} as StokerPermissions
        user.permissions.Role ||= record.Role
        user.permissions.Enabled ||= record.Enabled
    }

    const preWriteChecks = async (transaction: Transaction, batchSize?: { size: number }) => {
        const [latestDeploy, maintenanceMode, permissionsSnapshot, latestSchema] = await Promise.all([
            transaction.get(db.collection("system_deployment").doc("latest_deploy")),
            transaction.get(db.collection("system_deployment").doc("maintenance_mode")),
            userId
                ? transaction.get(
                      db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(userId),
                  )
                : Promise.resolve(Promise.resolve({} as DocumentSnapshot)),
            fetchCurrentSchema(),
        ])
        if (batchSize) batchSize.size += 3

        if (!latestDeploy.exists) throw new Error("VERSION_ERROR")
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const deploy = latestDeploy.data()!
        if (deploy.force && record.Last_Write_At.valueOf() < deploy.time.valueOf()) throw new Error("VERSION_ERROR")

        if (!maintenanceMode.exists) throw new Error("MAINTENANCE_MODE")
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const maintenance = maintenanceMode.data()!
        if (maintenance.active) throw new Error("MAINTENANCE_MODE")

        schema = latestSchema

        if (userId) {
            if (!permissionsSnapshot?.exists) throw new Error("PERMISSION_DENIED")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            currentUserPermissions = permissionsSnapshot.data()!
            if (!currentUserPermissions.Role) throw new Error("USER_ERROR")
            if (!currentUserPermissions.Enabled) throw new Error("PERMISSION_DENIED")
        }

        const uniqueFields = fields.filter((field) => "unique" in field && field.unique)
        const uniqueFieldPromises = uniqueFields.map(async (field) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (!userId || !field.access || field.access.includes(currentUserPermissions!.Role!)) {
                if (!data[field.name]) return
                const fieldCustomization = getFieldCustomization(field, customization)
                const allowField =
                    userId && fieldCustomization?.custom?.serverAccess?.read !== undefined
                        ? await tryPromise(fieldCustomization.custom.serverAccess.read, [
                              currentUserPermissions?.Role,
                              record,
                          ])
                        : true
                if (!allowField) throw new Error("PERMISSION_DENIED")
                const fieldName = data[field.name].toString().toLowerCase().replace(/\s/g, "---").replaceAll("/", "|||")
                if (!isValidUniqueFieldValue(fieldName)) {
                    throw new Error(`VALIDATION_ERROR: ${field.name} "${record[field.name]}" is invalid`)
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
                    if (unique?.exists) {
                        throw new Error(`VALIDATION_ERROR: ${field.name} "${record[field.name]}" already exists`)
                    }
                }
            }
        })

        await Promise.all(uniqueFieldPromises)

        addRecordAccessControl(
            record,
            docId,
            collectionSchema,
            schema,
            userId,
            currentUserPermissions,
            user?.permissions,
        )

        if (user?.permissions && userId && currentUserPermissions) {
            await entityRestrictionAccess(transaction, user.permissions, userId, currentUserPermissions, schema)
        }

        addRecordAccessControl(
            record,
            docId,
            collectionSchema,
            schema,
            userId,
            currentUserPermissions,
            user?.permissions,
        )
    }

    if (collectionSchema.auth && user) {
        await db.runTransaction(
            async (transaction) => {
                await preWriteChecks(transaction)
            },
            { maxAttempts: 10 },
        )
        const uid = await addUser(
            tenantId,
            docId,
            globalConfig,
            labels.collection,
            record,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            user.permissions!,
            user.password,
        )
        record.User_ID = uid
    }

    try {
        const batchSize = { size: 1 }
        await db.runTransaction(
            async (transaction) => {
                await preWriteChecks(transaction, batchSize)

                if (!options?.noTwoWay) {
                    await validateRelations(
                        "Create",
                        tenantId,
                        docId,
                        record,
                        record,
                        collectionSchema,
                        schema,
                        transaction,
                        batchSize,
                        userId,
                        currentUserPermissions,
                    )
                }

                const roleGroups = getAllRoleGroups(schema)
                addDenormalized(
                    "create",
                    transaction,
                    path,
                    docId,
                    record,
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
                    undefined,
                    undefined,
                    batchSize,
                )
                transaction.set(ref.doc(docId), record)
            },
            { maxAttempts: 10 },
        )
    } catch (error) {
        const postWriteErrorArgs: PostWriteErrorHookArgs = ["create", record, docId, context, error]
        const errorHook = await runHooks("postWriteError", globalConfig, customization, postWriteErrorArgs)
        if (enableWriteLog) {
            await new Promise((resolve) => {
                setTimeout(resolve, 250)
            })
            await writeLog(
                "create",
                errorHook?.resolved ? "success" : "failed",
                record,
                tenantId,
                path,
                docId,
                collectionSchema,
                errorHook?.resolved ? undefined : error,
            )
        }
        if (!errorHook?.resolved) {
            if (collectionSchema.auth && user) {
                await deleteUser(record)
            }
            throw error
        }
    }

    const postWriteArgs: PostWriteHookArgs = ["create", record, docId, context]
    const postOperationArgs: PostOperationHookArgs = [...postWriteArgs]
    await runHooks("postWrite", globalConfig, customization, postWriteArgs)
    await runHooks("postOperation", globalConfig, customization, postOperationArgs)

    const result = { id: docId, ...record }
    return result
}

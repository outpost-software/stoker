import { writeLog } from "./writeLog.js"
import { DocumentSnapshot, FieldValue, getFirestore, Timestamp, Transaction } from "firebase-admin/firestore"
import {
    addDenormalized,
    runHooks,
    removeUndefined,
    addSystemFields,
    tryPromise,
    deleteRecordAccessControl,
    getRecordSystemFields,
    getAllRoleGroups,
} from "@stoker-platform/utils"
import {
    CollectionSchema,
    CollectionField,
    RelationField,
    StokerCollection,
    PostOperationHookArgs,
    PostWriteHookArgs,
    PreOperationHookArgs,
    PreWriteHookArgs,
    PostWriteErrorHookArgs,
    StokerRecord,
    StokerRole,
    StokerPermissions,
} from "@stoker-platform/types"
import { getFirestorePathRef } from "../utils/getFirestorePathRef.js"
import { getOne } from "../read/getOne.js"
import { getGlobalConfigModule, getCustomizationFile, getTenant } from "../initializeStoker.js"
import { validateCollectionPath } from "../utils/validateCollectionPath.js"
import { deleteUser } from "./deleteUser.js"
import { updateRecord } from "./updateRecord.js"
import { fetchCurrentSchema } from "../utils/fetchSchema.js"

export const deleteRecord = async (
    path: string[],
    docId: string,
    userId?: string,
    options?: { force?: boolean },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
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
    const { labels, auth, enableWriteLog, softDelete } = collectionSchema
    const customization = getCustomizationFile(labels.collection, schema)
    const appName = await tryPromise(globalConfig.appName)

    if (softDelete && !auth && !options?.force) {
        const result = await updateRecord(
            path,
            docId,
            { [softDelete.archivedField]: true, [softDelete.timestampField]: FieldValue.serverTimestamp() },
            undefined,
            userId,
        )
        return result
    }

    const db = getFirestore()

    let currentUserPermissions: StokerPermissions | undefined
    if (userId) {
        await validateCollectionPath(path, collectionSchema)
    }

    const ref = getFirestorePathRef(db, path, tenantId)

    context = context || {}
    context.collection = labels.collection

    const data = await getOne(path, docId, { user: userId })

    let record: StokerRecord = addSystemFields(
        "delete",
        path,
        data,
        schema,
        appName,
        "Online",
        userId || "System",
        Timestamp.now(),
        FieldValue.serverTimestamp(),
    )
    const systemFields = getRecordSystemFields(record)

    removeUndefined(record)

    if (enableWriteLog) await writeLog("delete", "started", record, tenantId, path, docId, collectionSchema)

    const preOperationArgs: PreOperationHookArgs = ["delete", record, docId, context]
    await runHooks("preOperation", globalConfig, customization, preOperationArgs)
    const preWriteArgs: PreWriteHookArgs = ["delete", record, docId, context]
    await runHooks("preWrite", globalConfig, customization, preWriteArgs)

    removeUndefined(record)

    const preWriteChecks = async (transaction: Transaction) => {
        const [maintenanceMode, latestOriginalRecord, permissionsSnapshot, latestSchema] = await Promise.all([
            transaction.get(db.collection("system_deployment").doc("maintenance_mode")),
            getOne([labels.collection], docId, { user: userId, providedTransaction: transaction }),
            userId
                ? transaction.get(
                      db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(userId),
                  )
                : Promise.resolve(Promise.resolve({} as DocumentSnapshot)),
            fetchCurrentSchema(),
        ])

        if (!maintenanceMode.exists) throw new Error("MAINTENANCE_MODE")
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const maintenance = maintenanceMode.data()!
        if (maintenance.active) throw new Error("MAINTENANCE_MODE")

        if (!latestOriginalRecord) throw new Error("NOT_FOUND")
        record = { ...latestOriginalRecord, ...systemFields } as StokerRecord

        schema = latestSchema

        if (userId) {
            if (!permissionsSnapshot?.exists) throw new Error("PERMISSION_DENIED")
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            currentUserPermissions = permissionsSnapshot.data()!
            if (!currentUserPermissions.Role) throw new Error("USER_ERROR")
            if (!currentUserPermissions.Enabled) throw new Error("PERMISSION_DENIED")

            deleteRecordAccessControl(record, docId, collectionSchema, schema, userId, currentUserPermissions)
        }

        if (userId && currentUserPermissions?.Role) {
            const role = currentUserPermissions.Role
            const allowedCollection =
                customization.custom?.serverAccess?.delete !== undefined
                    ? await tryPromise(customization.custom.serverAccess.delete, [role, record])
                    : true
            if (!allowedCollection) throw new Error("PERMISSION_DENIED")
        }
    }

    if (collectionSchema.auth) {
        await db.runTransaction(
            async (transaction) => {
                await preWriteChecks(transaction)
            },
            { maxAttempts: 10 },
        )
        if (record.User_ID) {
            await deleteUser(record)
        }
    }

    try {
        await db.runTransaction(
            async (transaction) => {
                await preWriteChecks(transaction)

                const roleGroups = getAllRoleGroups(schema)
                addDenormalized(
                    "delete",
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
                )

                transaction.delete(ref.doc(docId))
            },
            { maxAttempts: 10 },
        )
    } catch (error) {
        const postWriteErrorArgs: PostWriteErrorHookArgs = ["delete", record, docId, context, error]
        const errorHook = await runHooks("postWriteError", globalConfig, customization, postWriteErrorArgs)
        if (enableWriteLog) {
            await new Promise((resolve) => {
                setTimeout(resolve, 250)
            })
            await writeLog(
                "delete",
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
            if (collectionSchema.auth && record.User_ID) {
                await db
                    .collection("tenants")
                    .doc(tenantId)
                    .collection(labels.collection)
                    .doc(docId)
                    .update({ User_ID: FieldValue.delete() })
            }
            throw error
        }
    }

    const postWriteArgs: PostWriteHookArgs = ["delete", record, docId, context]
    const postOperationArgs: PostOperationHookArgs = [...postWriteArgs]
    await runHooks("postWrite", globalConfig, customization, postWriteArgs)
    await runHooks("postOperation", globalConfig, customization, postOperationArgs)

    const result = { id: docId, ...record }
    return result
}

import {
    getCollectionConfigModule,
    getSchema,
    getGlobalConfigModule,
    getConnectionStatus,
    getCurrentUserPermissions,
    getAllRoleGroups,
    getTenant,
} from "../initializeStoker.js"
import { writeLog } from "./writeLog.js"
import {
    writeBatch,
    doc,
    arrayUnion,
    deleteField,
    arrayRemove,
    Timestamp,
    serverTimestamp,
    getFirestore,
} from "firebase/firestore"
import {
    runHooks,
    addDenormalized,
    removeUndefined,
    addSystemFields,
    getCachedConfigValue,
    deleteRecordAccessControl,
} from "@stoker-platform/utils"
import {
    CollectionSchema,
    CollectionField,
    CollectionCustomization,
    RelationField,
    StokerRecord,
    PostOperationHookArgs,
    PostWriteHookArgs,
    PreOperationHookArgs,
    PreWriteHookArgs,
    StokerCollection,
    StokerRole,
} from "@stoker-platform/types"
import { saveRecord } from "./saveRecord.js"
import { isRetrying } from "../retryPendingWrites.js"
import { deleteRecordServer } from "./deleteRecordServer.js"
import { getOne } from "../read/getOne.js"
import { updateRecord } from "./updateRecord.js"
import { getAuth } from "firebase/auth"

export const deleteRecord = async (
    path: string[],
    docId: string,
    options?: { retry?: { type: string; record: StokerRecord } },
) => {
    const tenantId = getTenant()
    const schema = getSchema()
    const roleGroups = getAllRoleGroups()
    const auth = getAuth()
    const db = getFirestore()
    const globalConfig = getGlobalConfigModule()
    const permissions = getCurrentUserPermissions()
    if (path.length === 0) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionName: StokerCollection = path.at(-1)!
    const collectionFound = Object.keys(schema.collections).includes(collectionName)
    const collectionDisabled = globalConfig.disabledCollections?.includes(collectionName)
    if (!collectionFound || collectionDisabled) throw new Error("COLLECTION_NOT_FOUND")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema: CollectionSchema = schema.collections[collectionName]
    const { labels, access, enableWriteLog, softDelete } = collectionSchema
    const { serverWriteOnly } = access
    const customization: CollectionCustomization = getCollectionConfigModule(labels.collection)
    const appName = await getCachedConfigValue(globalConfig, ["global", "appName"])
    const retry = options?.retry

    const currentUser = auth.currentUser
    if (!currentUser) throw new Error("NOT_AUTHENTICATED")
    if (!permissions) throw new Error("PERMISSION_DENIED")

    if (softDelete && !collectionSchema.auth) {
        const result = await updateRecord(path, docId, {
            [softDelete.archivedField]: true,
            [softDelete.timestampField]: serverTimestamp(),
        })
        return result
    }

    const offlineDisabled = await getCachedConfigValue(customization, [
        "collections",
        labels.collection,
        "custom",
        "disableOfflineDelete",
    ])
    const checkOnline = () => {
        if (getConnectionStatus() === "Offline" && (offlineDisabled || serverWriteOnly || collectionSchema.auth)) {
            throw new Error("CLIENT_OFFLINE")
        }
    }
    checkOnline()

    if (isRetrying(docId)) throw new Error("RECORD_BUSY")

    let data: StokerRecord
    try {
        data = await getOne(path, docId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        if (enableWriteLog && retry?.record && error.message.indexOf("NOT_FOUND") !== -1) {
            await writeLog("delete", "failed", retry?.record, path, docId, collectionSchema, currentUser.uid, error)
        }
        throw error
    }

    if (serverWriteOnly || (collectionSchema.auth && data.User_ID)) {
        const result = await deleteRecordServer(path, docId)
        return result
    }

    delete data.id

    const batch = writeBatch(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context: any = { collection: labels.collection }

    const record: StokerRecord = addSystemFields(
        "delete",
        path,
        data,
        schema,
        appName,
        getConnectionStatus(),
        currentUser.uid,
        Timestamp.now(),
        serverTimestamp(),
        !!retry,
    )

    removeUndefined(record)

    if (!retry && enableWriteLog) writeLog("delete", "started", record, path, docId, collectionSchema, currentUser.uid)

    if (!retry) {
        const preOperationArgs: PreOperationHookArgs = ["delete", record, docId, context, batch]
        await runHooks("preOperation", globalConfig, customization, preOperationArgs)
        const preWriteArgs: PreWriteHookArgs = ["delete", record, docId, context, batch]
        await runHooks("preWrite", globalConfig, customization, preWriteArgs)
    }

    removeUndefined(record)

    deleteRecordAccessControl(record, docId, collectionSchema, schema, currentUser.uid, permissions)

    const uniqueRef = (field: CollectionField, uniqueValue: string) =>
        doc(
            db,
            "tenants",
            tenantId,
            "system_unique",
            labels.collection,
            `Unique-${labels.collection}-${field.name}`,
            uniqueValue,
        )

    addDenormalized(
        "delete",
        batch,
        path,
        docId,
        record,
        schema,
        collectionSchema,
        options,
        roleGroups,
        arrayUnion,
        arrayRemove,
        deleteField,
        (field: CollectionField) =>
            doc(
                db,
                "tenants",
                tenantId,
                "system_fields",
                labels.collection,
                `${labels.collection}-${field.name}`,
                docId,
            ),
        uniqueRef,
        (role: StokerRole) =>
            doc(db, "tenants", tenantId, "system_fields", labels.collection, `${labels.collection}-${role}`, docId),
        (relationPath: string[], id: string) => doc(db, "tenants", tenantId, relationPath.join("/"), id),
        (field: RelationField, dependencyField: string, id: string) =>
            doc(
                db,
                "tenants",
                tenantId,
                "system_fields",
                field.collection,
                `${field.collection}-${dependencyField}`,
                id,
            ),
        (field: RelationField, role: StokerRole, id: string) =>
            doc(
                db,
                "tenants",
                tenantId,
                "system_fields",
                field.collection,
                `${field.collection}-${role.replaceAll(" ", "-")}`,
                id,
            ),
    )

    batch.delete(doc(db, "tenants", tenantId, path.join("/"), docId))

    if (!retry && enableWriteLog) {
        writeLog("delete", "written", record, path, docId, collectionSchema, currentUser.uid)
    }

    await saveRecord(
        "delete",
        path,
        docId,
        record,
        context,
        collectionSchema,
        customization,
        batch,
        currentUser.uid,
        enableWriteLog || false,
        permissions,
        !!retry,
    )

    if (enableWriteLog) {
        writeLog(
            "delete",
            "success",
            { ...record, ...(retry?.record || {}) },
            path,
            docId,
            collectionSchema,
            currentUser.uid,
        )
    }

    const postWriteArgs: PostWriteHookArgs = ["delete", record, docId, context, !!retry]
    const postOperationArgs: PostOperationHookArgs = [...postWriteArgs]
    await runHooks("postWrite", globalConfig, customization, postWriteArgs)
    await runHooks("postOperation", globalConfig, customization, postOperationArgs)

    const result = { id: docId, ...record }
    return result
}

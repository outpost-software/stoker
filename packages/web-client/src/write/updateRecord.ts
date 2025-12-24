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
    Timestamp,
    serverTimestamp,
    deleteField,
    arrayRemove,
    getFirestore,
} from "firebase/firestore"
import {
    addSystemFields,
    validateRecord,
    runHooks,
    addRelationArrays,
    addDenormalized,
    removeUndefined,
    getCachedConfigValue,
    updateRecordAccessControl,
    isDeleteSentinel,
    isRelationField,
    removeDeleteSentinels,
    addLowercaseFields,
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
    StokerPermissions,
} from "@stoker-platform/types"
import cloneDeep from "lodash/cloneDeep.js"
import { saveRecord } from "./saveRecord.js"
import { getAuth, validatePassword } from "firebase/auth"
import { isRetrying } from "../retryPendingWrites.js"
import { getOne } from "../read/getOne.js"
import { uniqueValidation } from "./uniqueValidation.js"
import { updateRecordServer } from "./updateRecordServer.js"

export const updateRecord = async (
    path: string[],
    docId: string,
    data: Partial<StokerRecord>,
    user?: {
        operation: "create" | "update" | "delete"
        password?: string
        passwordConfirm?: string
        permissions?: StokerPermissions
    },
    options?: {
        retry?: { type: string; originalRecord: StokerRecord }
    },
    originalRecord?: StokerRecord,
) => {
    const tenantId = getTenant()
    const schema = getSchema()
    const schemaWithComputedFields = getSchema(true)
    const roleGroups = getAllRoleGroups()
    const globalConfig = getGlobalConfigModule()
    const auth = getAuth()
    const db = getFirestore()
    const permissions = getCurrentUserPermissions()
    if (path.length === 0) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const collectionName: StokerCollection = path.at(-1)!
    const collectionFound = Object.keys(schema.collections).includes(collectionName)
    const collectionDisabled = globalConfig.disabledCollections?.includes(collectionName)
    if (!collectionFound || collectionDisabled) throw new Error("COLLECTION_NOT_FOUND")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema: CollectionSchema = schema.collections[collectionName]
    const { labels, access, fields, enableWriteLog } = collectionSchema
    const { serverWriteOnly } = access
    const customization: CollectionCustomization = getCollectionConfigModule(labels.collection)
    const appName = await getCachedConfigValue(globalConfig, ["global", "appName"])
    const retry = options?.retry

    const currentUser = auth.currentUser
    if (!currentUser) throw new Error("NOT_AUTHENTICATED")
    if (!permissions) throw new Error("PERMISSION_DENIED")

    if (isRetrying(docId)) throw new Error("RECORD_BUSY")

    originalRecord =
        retry?.originalRecord ||
        originalRecord ||
        (await getOne(path, docId, { noComputedFields: true, noEmbeddingFields: true }))

    // eslint-disable-next-line security/detect-object-injection
    for (const field of schemaWithComputedFields.collections[collectionName].fields) {
        if (field.type === "Computed") {
            delete data[field.name]
            delete originalRecord[field.name]
        }
    }

    const batch = writeBatch(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context: any = { collection: labels.collection }

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

    const offlineDisabled = await getCachedConfigValue(customization, [
        "collections",
        labels.collection,
        "custom",
        "disableOfflineUpdate",
    ])
    const checkOnline = () => {
        if (
            getConnectionStatus() === "Offline" &&
            (offlineDisabled ||
                serverWriteOnly ||
                (collectionSchema.auth && (createUserRequest || updateUserRequest || deleteUserRequest)))
        ) {
            throw new Error("CLIENT_OFFLINE")
        }
    }
    checkOnline()

    if (serverWriteOnly || createUserRequest || updateUserRequest || deleteUserRequest) {
        if (createUserRequest) {
            if (!user.password) throw new Error("VALIDATION_ERROR: Password is required")
            if (!user.passwordConfirm) throw new Error("VALIDATION_ERROR: Password Confirm is required")
            if (user.password !== user.passwordConfirm) {
                throw new Error("VALIDATION_ERROR: Passwords do not match")
            }
            const enableEmulators = await getCachedConfigValue(globalConfig, ["global", "firebase", "enableEmulators"])
            if (!enableEmulators) {
                checkOnline()
                try {
                    const { isValid } = await validatePassword(auth, user.password)
                    if (!isValid) {
                        throw new Error("Please create a stronger password")
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any) {
                    throw new Error(`VALIDATION_ERROR: ${error.message}`)
                }
            }
        }
        const result = await updateRecordServer(
            path,
            docId,
            data,
            user ? { operation: user.operation, permissions: user.permissions, password: user.password } : undefined,
        )
        return result
    }

    delete data.id

    const partial: StokerRecord = addSystemFields(
        "update",
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

    for (const field of fields) {
        if (!isRelationField(field) && isDeleteSentinel(partial[field.name]) && field.nullable) {
            partial[field.name] = null
        }
    }

    removeUndefined(partial)
    removeUndefined(originalRecord)

    if (!retry && enableWriteLog) {
        writeLog(
            "update",
            "started",
            partial,
            path,
            docId,
            collectionSchema,
            currentUser.uid,
            undefined,
            originalRecord,
        )
    }

    if (!retry) {
        const preOperationArgs: PreOperationHookArgs = [
            "update",
            partial,
            docId,
            context,
            batch,
            cloneDeep(originalRecord),
        ]
        await runHooks("preOperation", globalConfig, customization, preOperationArgs)
        const preWriteArgs: PreWriteHookArgs = ["update", partial, docId, context, batch, cloneDeep(originalRecord)]
        await runHooks("preWrite", globalConfig, customization, preWriteArgs)
    }

    addRelationArrays(collectionSchema, partial, schema)
    addLowercaseFields(collectionSchema, partial)

    if (!retry) {
        try {
            const record = { ...originalRecord, ...partial }
            removeDeleteSentinels(record)
            await validateRecord(
                "update",
                record,
                collectionSchema,
                customization,
                ["update", record, context, batch, cloneDeep(originalRecord)],
                schema,
            )
            if (offlineDisabled) {
                checkOnline()
                await uniqueValidation("update", docId, partial, collectionSchema, permissions)
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            throw new Error(`VALIDATION_ERROR: ${error.message}`)
        }
    }

    updateRecordAccessControl(partial, originalRecord, docId, collectionSchema, schema, currentUser.uid, permissions)

    removeUndefined(partial)

    addDenormalized(
        "update",
        batch,
        path,
        docId,
        partial,
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
        (field: CollectionField, uniqueValue: string) =>
            doc(
                db,
                "tenants",
                tenantId,
                "system_unique",
                labels.collection,
                `Unique-${labels.collection}-${field.name}`,
                uniqueValue,
            ),
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
        originalRecord,
    )

    batch.update(doc(db, "tenants", tenantId, path.join("/"), docId), partial)

    if (!retry && enableWriteLog) {
        writeLog(
            "update",
            "written",
            partial,
            path,
            docId,
            collectionSchema,
            currentUser.uid,
            undefined,
            originalRecord,
        )
    }

    await saveRecord(
        "update",
        path,
        docId,
        partial,
        context,
        collectionSchema,
        customization,
        batch,
        currentUser.uid,
        enableWriteLog || false,
        permissions,
        !!retry,
        originalRecord,
    )

    if (retry?.type === "unique") {
        const record = { ...originalRecord, ...partial }
        removeDeleteSentinels(record)
        const result = { id: docId, ...record }
        return result
    }

    if (enableWriteLog) {
        writeLog(
            "update",
            "success",
            partial,
            path,
            docId,
            collectionSchema,
            currentUser.uid,
            undefined,
            originalRecord,
        )
    }

    const postWriteArgs: PostWriteHookArgs = ["update", partial, docId, context, !!retry, cloneDeep(originalRecord)]
    const postOperationArgs: PostOperationHookArgs = [...postWriteArgs]
    await runHooks("postWrite", globalConfig, customization, postWriteArgs)
    await runHooks("postOperation", globalConfig, customization, postOperationArgs)

    const finalRecord = { ...originalRecord, ...partial }
    removeDeleteSentinels(finalRecord)
    const result = { id: docId, ...finalRecord }
    return result
}

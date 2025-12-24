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
    collection,
    arrayUnion,
    Timestamp,
    serverTimestamp,
    deleteField,
    arrayRemove,
    getFirestore,
} from "firebase/firestore"
import { getAuth, validatePassword } from "firebase/auth"
import {
    addSystemFields,
    validateRecord,
    runHooks,
    addRelationArrays,
    addInitialValues,
    addDenormalized,
    removeUndefined,
    getCachedConfigValue,
    addRecordAccessControl,
    addLowercaseFields,
} from "@stoker-platform/utils"
import {
    CollectionSchema,
    CollectionField,
    CollectionCustomization,
    RelationField,
    PostOperationHookArgs,
    PostWriteHookArgs,
    PreOperationHookArgs,
    PreWriteHookArgs,
    StokerRecord,
    StokerCollection,
    StokerRole,
    StokerPermissions,
} from "@stoker-platform/types"
import { saveRecord } from "./saveRecord.js"
import { uniqueValidation } from "./uniqueValidation.js"
import { addRecordServer } from "./addRecordServer.js"

export const addRecord = async (
    path: string[],
    data: Partial<StokerRecord>,
    user?: {
        password: string
        passwordConfirm: string
        permissions?: StokerPermissions
    },
    options?: {
        retry?: { type: string; docId: string }
    },
    id?: string,
    onValid?: () => void,
) => {
    const tenantId = getTenant()
    const schema = getSchema()
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
    const { labels, access, enableWriteLog, softDelete } = collectionSchema
    const { serverWriteOnly } = access
    const customization: CollectionCustomization = getCollectionConfigModule(labels.collection)
    const appName = await getCachedConfigValue(globalConfig, ["global", "appName"])
    const retry = options?.retry

    const currentUser = auth.currentUser
    if (!currentUser) throw new Error("NOT_AUTHENTICATED")
    if (!permissions) throw new Error("PERMISSION_DENIED")

    const offlineDisabled = await getCachedConfigValue(customization, [
        "collections",
        labels.collection,
        "custom",
        "disableOfflineCreate",
    ])
    const checkOnline = () => {
        if (
            getConnectionStatus() === "Offline" &&
            (offlineDisabled || serverWriteOnly || (collectionSchema.auth && user))
        ) {
            throw new Error("CLIENT_OFFLINE")
        }
    }
    checkOnline()

    const batch = writeBatch(db)
    const docId = retry?.docId || id || doc(collection(db, "tenants", tenantId, labels.collection)).id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const context: any = { collection: labels.collection }

    if (serverWriteOnly || (collectionSchema.auth && user)) {
        checkOnline()
        if (collectionSchema.auth && user) {
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
        if (onValid) {
            onValid()
        }
        const result = await addRecordServer(
            path,
            data,
            user ? { permissions: user.permissions, password: user.password } : undefined,
            docId,
        )
        return result
    }

    data.id = docId

    const record: StokerRecord = addSystemFields(
        "create",
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

    if (softDelete) {
        record[softDelete.archivedField] = false
    }

    removeUndefined(record)

    if (!retry && enableWriteLog) {
        writeLog("create", "started", record, path, docId, collectionSchema, currentUser.uid)
    }

    if (!retry) {
        const preOperationArgs: PreOperationHookArgs = ["create", record, docId, context, batch]
        await runHooks("preOperation", globalConfig, customization, preOperationArgs)
        const preWriteArgs: PreWriteHookArgs = ["create", record, docId, context, batch]
        await runHooks("preWrite", globalConfig, customization, preWriteArgs)
    }

    addRelationArrays(collectionSchema, record, schema)
    addLowercaseFields(collectionSchema, record)
    if (!retry) await addInitialValues(record, collectionSchema, customization, permissions.Role)

    if (!retry) {
        try {
            await validateRecord(
                "create",
                record,
                collectionSchema,
                customization,
                ["create", record, context, batch],
                schema,
            )
            if (offlineDisabled) {
                checkOnline()
                await uniqueValidation("create", docId, record, collectionSchema, permissions)
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            throw new Error(`VALIDATION_ERROR: ${error.message}`)
        }
    }

    if (onValid) {
        onValid()
    }

    removeUndefined(record)

    addRecordAccessControl(record, docId, collectionSchema, schema, currentUser.uid, permissions)

    addDenormalized(
        "create",
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
    )

    batch.set(doc(db, "tenants", tenantId, path.join("/"), docId), record)

    if (!retry && enableWriteLog) {
        writeLog("create", "written", record, path, docId, collectionSchema, currentUser.uid)
    }

    await saveRecord(
        "create",
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

    if (retry?.type === "unique") return { docId, record }

    if (enableWriteLog) {
        writeLog("create", "success", record, path, docId, collectionSchema, currentUser.uid)
    }

    const postWriteArgs: PostWriteHookArgs = ["create", record, docId, context, !!retry]
    const postOperationArgs: PostOperationHookArgs = [...postWriteArgs]
    await runHooks("postWrite", globalConfig, customization, postWriteArgs)
    await runHooks("postOperation", globalConfig, customization, postOperationArgs)

    const result = { id: docId, ...record }
    return result
}

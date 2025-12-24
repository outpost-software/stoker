import { CollectionSchema, CollectionsSchema, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { collectionAccess, collectionAuthAccess, privateFieldAccess, restrictUpdateAccess } from "../collection.js"
import { documentAccess } from "../document.js"
import { permissionsWriteAccess } from "../permissions.js"
import { removeDeleteSentinels } from "../../operations/removeDeleteSentinels.js"

export const updateRecordAccessControl = (
    partial: StokerRecord,
    originalRecord: StokerRecord,
    docId: string,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    currentUserId?: string,
    currentUserPermissions?: StokerPermissions,
    userOperation?: string,
    permissions?: StokerPermissions,
    originalPermissions?: StokerPermissions | undefined,
) => {
    const { labels, fields } = collectionSchema
    // eslint-disable-next-line security/detect-object-injection
    const collectionPermissions = currentUserPermissions?.collections?.[labels.collection]
    const finalRecord = { ...originalRecord, ...partial }
    removeDeleteSentinels(finalRecord)

    let granted = true
    let errorDetails = ""
    const logErrors = true

    if (currentUserId && !collectionPermissions) {
        throw new Error("PERMISSION_DENIED")
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (currentUserId && !collectionAccess("Update", collectionPermissions!)) {
        granted = false
        errorDetails = "Authenticated user does not have Update access to this collection"
    }
    if (
        currentUserId &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (!documentAccess("Update", collectionSchema, schema, currentUserId, currentUserPermissions!, originalRecord) ||
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            !documentAccess("Update", collectionSchema, schema, currentUserId, currentUserPermissions!, finalRecord))
    ) {
        granted = false
        errorDetails = "Authenticated user does not have Update access to this document"
    }

    if (userOperation) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (currentUserId && !collectionAuthAccess(collectionPermissions!)) {
            granted = false
            errorDetails = "Authenticated user does not have Auth access for this collection"
        }
        if (
            !permissionsWriteAccess(
                "update",
                finalRecord,
                docId,
                collectionSchema,
                schema,
                currentUserId,
                currentUserPermissions,
                permissions,
                originalPermissions,
                originalRecord,
                userOperation,
            )
        ) {
            errorDetails = "Authenticated user does not have sufficient write access for this record"
            granted = false
        }
    }

    for (const field of fields) {
        const value = partial[field.name]
        if (field.access) {
            if (!privateFieldAccess(field, currentUserPermissions) && value !== undefined) {
                errorDetails = `Authenticated user does not have access to field ${field.name}`
                granted = false
            }
        }
        if (value !== undefined && !restrictUpdateAccess(field, currentUserPermissions)) {
            errorDetails = `Authenticated user does not have Update access to field ${field.name}`
            granted = false
        }
    }

    if (!granted) {
        if (logErrors && errorDetails) {
            console.error(`PERMISSION_DENIED: ${errorDetails}`)
        }
        throw new Error("PERMISSION_DENIED")
    }

    return
}

import { CollectionSchema, CollectionsSchema, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { collectionAccess, collectionAuthAccess, privateFieldAccess, restrictCreateAccess } from "../collection.js"
import { documentAccess } from "../document.js"
import { permissionsWriteAccess } from "../permissions.js"

export const addRecordAccessControl = (
    record: StokerRecord,
    docId: string,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    currentUserId?: string,
    currentUserPermissions?: StokerPermissions,
    permissions?: StokerPermissions,
) => {
    const { labels, fields } = collectionSchema
    // eslint-disable-next-line security/detect-object-injection
    const collectionPermissions = currentUserPermissions?.collections?.[labels.collection]
    let granted = true

    if (currentUserId && !collectionPermissions) {
        throw new Error("PERMISSION_DENIED")
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (currentUserId && !collectionAccess("Create", collectionPermissions!)) granted = false

    if (
        currentUserId &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        !documentAccess("Create", collectionSchema, schema, currentUserId, currentUserPermissions!, record)
    )
        granted = false

    if (collectionSchema.auth && permissions) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (currentUserId && !collectionAuthAccess(collectionPermissions!)) granted = false
        if (
            !permissionsWriteAccess(
                "create",
                record,
                docId,
                collectionSchema,
                schema,
                currentUserId,
                currentUserPermissions,
                permissions,
            )
        ) {
            granted = false
        }
    }

    for (const field of fields) {
        const value = record[field.name]
        if (field.access) {
            if (!privateFieldAccess(field, currentUserPermissions) && value !== undefined) {
                granted = false
            }
        }
        if (value !== undefined && !restrictCreateAccess(field, currentUserPermissions)) granted = false
    }

    if (!granted) throw new Error("PERMISSION_DENIED")

    return
}

import { CollectionSchema, CollectionsSchema, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { collectionAccess, collectionAuthAccess } from "../collection.js"
import { documentAccess } from "../document.js"
import { permissionsWriteAccess } from "../permissions.js"

export const deleteRecordAccessControl = (
    record: StokerRecord,
    docId: string,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    currentUserId: string,
    currentUserPermissions: StokerPermissions,
) => {
    const { labels } = collectionSchema
    // eslint-disable-next-line security/detect-object-injection
    const collectionPermissions = currentUserPermissions.collections?.[labels.collection]
    let granted = true

    if (!collectionPermissions) {
        throw new Error("PERMISSION_DENIED")
    }

    if (!collectionAccess("Delete", collectionPermissions)) granted = false

    if (!documentAccess("Delete", collectionSchema, schema, currentUserId, currentUserPermissions, record))
        granted = false

    if (collectionSchema.auth && record.User_ID) {
        if (!collectionAuthAccess(collectionPermissions)) granted = false
        if (
            !permissionsWriteAccess(
                "delete",
                record,
                docId,
                collectionSchema,
                schema,
                currentUserId,
                currentUserPermissions,
            )
        ) {
            granted = false
        }
    }

    if (!granted) throw new Error("PERMISSION_DENIED")

    return
}

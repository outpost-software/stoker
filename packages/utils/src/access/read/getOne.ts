import { CollectionSchema, CollectionsSchema, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { collectionAccess } from "../collection.js"
import { documentAccess } from "../document.js"

export const getOneAccessControl = async (
    record: StokerRecord,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    userId: string,
    permissions: StokerPermissions,
) => {
    const { labels } = collectionSchema
    // eslint-disable-next-line security/detect-object-injection
    const collectionPermissions = permissions.collections?.[labels.collection]
    let granted = true

    if (!collectionPermissions) {
        granted = false
        return
    }

    if (!collectionAccess("Read", collectionPermissions)) granted = false

    if (!documentAccess("Read", collectionSchema, schema, userId, permissions, record)) granted = false

    if (!granted) throw new Error("PERMISSION_DENIED")

    return
}

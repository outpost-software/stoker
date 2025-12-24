import { StokerPermissions, RoleGroup } from "@stoker-platform/types"
import { getCurrentUserPermissions, getSchema, getTenant } from "../initializeStoker"
import { collectionAccess, hasDependencyAccess } from "@stoker-platform/utils"
import { doc, getFirestore } from "firebase/firestore"

export const getDocumentRefs = (path: string[], docId: string, roleGroup: RoleGroup) => {
    const db = getFirestore()
    const tenantId = getTenant()
    const schema = getSchema()
    const permissions = getCurrentUserPermissions() as StokerPermissions
    const collectionName = path.at(-1)
    if (!collectionName) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collectionName]
    const { labels } = collectionSchema
    const collectionPermissions = permissions.collections?.[labels.collection]

    if (!permissions.Role) {
        throw new Error("PERMISSION_DENIED")
    }

    const fullCollectionAccess = collectionPermissions && collectionAccess("Read", collectionPermissions)
    const dependencyAccess = hasDependencyAccess(collectionSchema, schema, permissions)

    const queries = []
    if (fullCollectionAccess) {
        queries.push(
            doc(
                db,
                "tenants",
                tenantId,
                "system_fields",
                labels.collection,
                `${labels.collection}-${roleGroup.key}`,
                docId,
            ),
        )
    } else if (dependencyAccess) {
        for (const field of dependencyAccess) {
            queries.push(
                doc(
                    db,
                    "tenants",
                    tenantId,
                    "system_fields",
                    labels.collection,
                    `${labels.collection}-${field.field}`,
                    docId,
                ),
            )
        }
    }
    return queries
}

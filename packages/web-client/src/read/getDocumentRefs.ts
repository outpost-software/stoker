import { StokerPermissions, RoleGroup } from "@stoker-platform/types"
import {
    getCurrentUser,
    getCurrentUserPermissions,
    getSchema,
    getStokerFirestore,
    getTenant,
} from "../initializeStoker"
import {
    collectionAccess,
    evaluateFieldAccessCondition,
    getFieldAccessGroupFields,
    getFieldAccessGroupKey,
    hasDependencyAccess,
} from "@stoker-platform/utils"
import { doc } from "firebase/firestore"

export const getDocumentRefs = (path: string[], recordId: string, roleGroup: RoleGroup) => {
    const db = getStokerFirestore()
    const tenantId = getTenant()
    const schema = getSchema()
    const permissions = getCurrentUserPermissions() as StokerPermissions
    const claims = getCurrentUser()?.token.claims ?? {}
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
    const dependencyAccess = hasDependencyAccess(collectionSchema, schema, permissions, claims)

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
                recordId,
            ),
        )
        const fieldAccessGroups = getFieldAccessGroupFields(collectionSchema)
        Object.entries(collectionSchema.fieldAccessGroups || {}).forEach(([groupKey, condition]) => {
            // eslint-disable-next-line security/detect-object-injection
            if (!fieldAccessGroups[groupKey]?.length) return
            if (!evaluateFieldAccessCondition(condition, labels.collection, permissions, claims)) return
            const overlayKey = getFieldAccessGroupKey(groupKey, roleGroup.key)
            queries.push(
                doc(
                    db,
                    "tenants",
                    tenantId,
                    "system_fields",
                    labels.collection,
                    `${labels.collection}-${overlayKey}`,
                    recordId,
                ),
            )
        })
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
                    recordId,
                ),
            )
        }
    }
    return queries
}

import { getFirestorePathRef } from "../utils/getFirestorePathRef"
import { CollectionsSchema, StokerPermissions } from "@stoker-platform/types"
import {
    collectionAccess,
    evaluateFieldAccessCondition,
    getFieldAccessGroupFields,
    getRoleGroup,
    hasDependencyAccess,
} from "@stoker-platform/utils"
import { DocumentReference } from "firebase-admin/firestore"
import { getStokerFirestore } from "../utils/getStokerFirestore.js"

export const getDocumentRefs = (
    tenantId: string,
    path: string[],
    recordId: string,
    schema: CollectionsSchema,
    permissions?: StokerPermissions,
    claims?: Record<string, unknown>,
): DocumentReference[] => {
    const db = getStokerFirestore()
    const collectionName = path.at(-1)
    if (!collectionName) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collectionName]
    const { labels } = collectionSchema

    const ref = getFirestorePathRef(db, path, tenantId)

    if (!permissions) {
        return [ref.doc(recordId)]
    } else {
        // eslint-disable-next-line security/detect-object-injection
        const collectionPermissions = permissions.collections?.[labels.collection]

        if (!permissions.Role) {
            throw new Error("PERMISSION_DENIED")
        }

        const fullCollectionAccess = collectionPermissions && collectionAccess("Read", collectionPermissions)
        const dependencyAccess = hasDependencyAccess(collectionSchema, schema, permissions, claims ?? {})

        const queries = []
        const roleGroup = getRoleGroup(permissions.Role, collectionSchema, schema)
        if (!roleGroup) {
            throw new Error("PERMISSION_DENIED")
        }
        if (fullCollectionAccess) {
            queries.push(
                db
                    .collection("tenants")
                    .doc(tenantId)
                    .collection("system_fields")
                    .doc(labels.collection)
                    .collection(`${labels.collection}-${roleGroup.key}`)
                    .doc(recordId),
            )
            const fieldAccessGroups = getFieldAccessGroupFields(collectionSchema)
            Object.entries(collectionSchema.fieldAccessGroups || {}).forEach(([groupKey, condition]) => {
                // eslint-disable-next-line security/detect-object-injection
                if (!fieldAccessGroups[groupKey]?.length) return
                if (!evaluateFieldAccessCondition(condition, labels.collection, permissions, claims ?? {})) return
                queries.push(
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(labels.collection)
                        .collection(`${labels.collection}-${groupKey}`)
                        .doc(recordId),
                )
            })
        } else if (dependencyAccess) {
            for (const field of dependencyAccess) {
                queries.push(
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(labels.collection)
                        .collection(`${labels.collection}-${field.field}`)
                        .doc(recordId),
                )
            }
        }
        return queries
    }
}

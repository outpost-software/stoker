import { getFirestorePathRef } from "../utils/getFirestorePathRef"
import { CollectionsSchema, StokerPermissions } from "@stoker-platform/types"
import { collectionAccess, getRoleGroup, hasDependencyAccess } from "@stoker-platform/utils"
import { DocumentReference, getFirestore } from "firebase-admin/firestore"

export const getDocumentRefs = (
    tenantId: string,
    path: string[],
    docId: string,
    schema: CollectionsSchema,
    permissions?: StokerPermissions,
): DocumentReference[] => {
    const db = getFirestore()
    const collectionName = path.at(-1)
    if (!collectionName) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collectionName]
    const { labels } = collectionSchema

    const ref = getFirestorePathRef(db, path, tenantId)

    if (!permissions) {
        return [ref.doc(docId)]
    } else {
        // eslint-disable-next-line security/detect-object-injection
        const collectionPermissions = permissions.collections?.[labels.collection]

        if (!permissions.Role) {
            throw new Error("PERMISSION_DENIED")
        }

        const fullCollectionAccess = collectionPermissions && collectionAccess("Read", collectionPermissions)
        const dependencyAccess = hasDependencyAccess(collectionSchema, schema, permissions)

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
                    .doc(docId),
            )
        } else if (dependencyAccess) {
            for (const field of dependencyAccess) {
                queries.push(
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(labels.collection)
                        .collection(`${labels.collection}-${field.field}`)
                        .doc(docId),
                )
            }
        }
        return queries
    }
}

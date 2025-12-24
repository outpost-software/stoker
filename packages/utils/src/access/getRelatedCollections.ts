import { CollectionSchema, CollectionsSchema, StokerPermissions } from "@stoker-platform/types"
import { isRelationField } from "../schema/isRelationField.js"
import { collectionAccess, privateFieldAccess } from "../access/collection.js"
import { hasDependencyAccess } from "./hasDependencyAccess.js"

export const getRelatedCollections = (
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    permissions?: StokerPermissions,
): string[] => {
    const relatedCollections = []
    for (const field of collectionSchema.fields) {
        if (isRelationField(field)) {
            if (field.access && (!permissions || !privateFieldAccess(field, permissions))) continue
            const relatedCollection = schema.collections[field.collection]
            if (!relatedCollection) continue
            const relatedCollectionPermissions = permissions?.collections?.[field.collection]
            if (!relatedCollectionPermissions) continue
            if (
                !permissions ||
                collectionAccess("Read", relatedCollectionPermissions) ||
                hasDependencyAccess(collectionSchema, schema, permissions)
            ) {
                relatedCollections.push(field.collection)
            }
        }
    }
    return Array.from(new Set(relatedCollections))
}

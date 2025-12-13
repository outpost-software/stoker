import { CollectionSchema, CollectionsSchema, StokerPermissions } from "@stoker-platform/types"
import { collectionAccess } from "./collection.js"

export const getRecordSubcollections = (
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    permissions?: StokerPermissions,
) => {
    const { labels } = collectionSchema

    const subcollections: CollectionSchema[] = []

    for (const collection of Object.values(schema.collections)) {
        const collectionPermissions = permissions?.collections?.[collection.labels.collection]
        if (!collectionPermissions) continue
        if (
            collection.parentCollection === labels.collection &&
            (!permissions || collectionAccess("Read", collectionPermissions))
        ) {
            subcollections.push(collection)
        }
    }

    return subcollections
}

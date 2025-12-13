import { CollectionSchema, CollectionsSchema, StokerCollection } from "@stoker-platform/types"

export const getSubcollections = (schema: CollectionsSchema, collectionSchema: CollectionSchema) => {
    const subcollections: StokerCollection[] = []
    Object.values(schema.collections).forEach((collection) => {
        if (collection.parentCollection === collectionSchema.labels.collection) {
            subcollections.push(collection.labels.collection)
        }
    })
    return subcollections
}

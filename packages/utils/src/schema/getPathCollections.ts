import { CollectionSchema, CollectionsSchema } from "@stoker-platform/types"

export const getPathCollections = (collection: CollectionSchema, schema: CollectionsSchema) => {
    const path = [collection]

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const getParentPath = (collection: CollectionSchema) => {
        if (collection.parentCollection) {
            path.unshift(schema.collections[collection.parentCollection])
            getParentPath(schema.collections[collection.parentCollection])
        }
    }
    getParentPath(collection)

    return path
}

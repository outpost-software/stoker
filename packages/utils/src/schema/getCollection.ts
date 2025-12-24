import type { CollectionSchema } from "@stoker-platform/types"

export const getCollection = (collections: CollectionSchema[], collectionName: string) => {
    return collections.filter((collection) => collection.labels.collection === collectionName)[0]
}

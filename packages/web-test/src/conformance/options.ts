import type { CollectionSchema } from "@stoker-platform/types"

export interface ConformanceOptions {
    /**
     * Collections to leave out of the generated suite
     */
    excludeCollections?: string[]
    /** Skip individual suites */
    skip?: {
        access?: boolean
        collections?: boolean
        records?: boolean
    }
}

export const included = (collections: CollectionSchema[], options: ConformanceOptions): CollectionSchema[] =>
    collections.filter((collection) => !options.excludeCollections?.includes(collection.labels.collection))

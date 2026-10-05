import type { CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import type { StokerProject } from "./project.js"
import { listableCollections } from "./schema.js"

export interface ConformanceOptions {
    /**
     * Collections to leave out of the generated suite
     */
    excludeCollections?: string[]
    /** Skip individual suites */
    skip?: {
        access?: boolean
        editing?: boolean
        collections?: boolean
        records?: boolean
    }
}

export const included = (collections: CollectionSchema[], options: ConformanceOptions): CollectionSchema[] =>
    collections.filter((collection) => !options.excludeCollections?.includes(collection.labels.collection))

export const includedCollections = (schema: CollectionsSchema, role: string, options: ConformanceOptions) =>
    included(listableCollections(schema, role), options).sort(
        (a, b) => (a.seedOrder ?? Number.POSITIVE_INFINITY) - (b.seedOrder ?? Number.POSITIVE_INFINITY),
    )

export const fixtureCollections = (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
) =>
    includedCollections(schema, role, options).filter((collection) => {
        // eslint-disable-next-line security/detect-object-injection
        return !!project.records[collection.labels.collection]
    })

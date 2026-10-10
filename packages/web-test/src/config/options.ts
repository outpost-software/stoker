import type { CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import { test } from "@playwright/test"
import type { StokerProject } from "./project.js"
import { listableCollections } from "./schema.js"

/** Skip collection steps inside an individual test for given roles. */
export interface SkippedTest {
    /** `test.describe` title */
    suite: string
    /** `test` title */
    test: string
    /** Collection names whose step is skipped, or `true` to skip every collection. */
    collections: string[] | true
    /** Roles the skip applies to. */
    roles: string[]
}

export interface ConformanceOptions {
    /**
     * Collections to leave out of the generated suite
     */
    excludeCollections?: string[]
    /** Skip individual suites */
    skipSuites?: {
        access?: boolean
        editing?: boolean
        collections?: boolean
        records?: boolean
    }
    /** Skip collection steps inside individual tests for given roles. */
    skipTests?: SkippedTest[]
}

export const skipsAllCollections = (options: ConformanceOptions, role: string) => {
    const titles = test.info().titlePath
    return !!options.skipTests?.some(
        (item) =>
            titles.includes(item.suite) &&
            titles.includes(item.test) &&
            item.collections === true &&
            item.roles.includes(role),
    )
}

export const skipCollection = (options: ConformanceOptions, role: string, collection: string) => {
    const titles = test.info().titlePath
    const match = options.skipTests?.find(
        (item) =>
            titles.includes(item.suite) &&
            titles.includes(item.test) &&
            (item.collections === true || item.collections.includes(collection)) &&
            item.roles.includes(role),
    )
    if (!match) return false
    test.info().annotations.push({
        type: "skipped",
        description: `${collection}: ${match.suite} / ${match.test} is skipped for ${role}`,
    })
    return true
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

import { WhereFilterOp, onSnapshot, where, query, or, and } from "firebase/firestore"
import { getCollectionRefs } from "../getCollectionRefs"
import { CollectionCustomization, CollectionSchema, PreloadCacheRange } from "@stoker-platform/types"
import { getCachedConfigValue, getRange } from "@stoker-platform/utils"
import {
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getCurrentUserRoleGroups,
    getGlobalConfigModule,
} from "../../initializeStoker"
import { getPreloadListeners } from "./preloadCache"

export const preloadData = async (
    collectionSchema: CollectionSchema,
    constraints?: [string, WhereFilterOp, unknown][],
    rangeConstraints?: PreloadCacheRange,
    orQueries?: [string, WhereFilterOp, unknown][],
    tempCache?: string,
) => {
    const { labels, preloadCache } = collectionSchema
    const roleGroups = getCurrentUserRoleGroups()
    const roleGroup = roleGroups[labels.collection]
    const globalConfig = getGlobalConfigModule()
    const customization: CollectionCustomization = getCollectionConfigModule(labels.collection)
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    if (!preloadCache?.roles.includes(permissions.Role)) return

    const listeners = getPreloadListeners()

    let location = labels.collection
    if (tempCache) {
        location = tempCache
        // eslint-disable-next-line security/detect-object-injection
        listeners[location] ||= []
    }
    // eslint-disable-next-line security/detect-object-injection
    if (listeners[location]) {
        // eslint-disable-next-line security/detect-object-injection
        listeners[location].forEach((unsubscribe) => unsubscribe())
    }

    const timezone = await getCachedConfigValue(globalConfig, ["global", "timezone"])
    constraints ||= (await getCachedConfigValue(customization, [
        "collections",
        labels.collection,
        "custom",
        "preloadCacheConstraints",
    ])) as [string, WhereFilterOp, unknown][]
    orQueries ||= (await getCachedConfigValue(customization, [
        "collections",
        labels.collection,
        "custom",
        "preloadCacheOrQueries",
    ])) as [string, WhereFilterOp, unknown][]
    if (!tempCache) {
        rangeConstraints ||= preloadCache.range
    }

    const queries = getCollectionRefs([labels.collection], roleGroup, !!tempCache).map((ref) => {
        if (rangeConstraints) {
            const { start, end } = getRange(rangeConstraints, timezone)
            const rangeQueries = rangeConstraints.fields
                .filter((field) => !rangeConstraints.ranges?.some((range) => range.includes(field)))
                .map((field) => {
                    return and(where(field, ">=", start), where(field, "<=", end))
                })
            const rangeRanges = rangeConstraints.ranges?.map((range) => {
                return and(where(range[0], "<=", end), where(range[1], ">=", start))
            })
            ref = query(ref, or(...rangeQueries, ...(rangeRanges || [])))
        }
        if (orQueries) {
            ref = query(ref, and(or(...orQueries.map((constraint) => where(...constraint)))))
        }
        if (constraints) {
            ref = query(ref, and(...constraints.map((constraint) => where(...constraint))))
        }
        return ref
    })

    const loaded = new Map()

    return new Promise((resolve, reject) => {
        if (queries.length === 0) {
            resolve({})
            return
        }
        queries.forEach((query) => {
            let initialized = false
            const listener = onSnapshot(
                query,
                { includeMetadataChanges: true },
                (snapshot) => {
                    if (!snapshot.metadata.fromCache || initialized) {
                        if (!initialized) {
                            initialized = true
                            loaded.set(query, true)
                            if (loaded.size === queries.length) {
                                resolve({})
                            }
                        }
                    }
                },
                (error) => {
                    console.error(`${location} - ${error.message}`)
                    reject(error)
                },
            )
            // eslint-disable-next-line security/detect-object-injection
            listeners[location].push(listener)
        })
    })
}

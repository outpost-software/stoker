import { PreloadCacheInitial, PreloadCacheRange, StokerCollection } from "@stoker-platform/types"
import { getCurrentUserPermissions, getLoadingState, getSchema } from "../../initializeStoker"
import { collectionAccess, getRelatedCollections, hasDependencyAccess, tryPromise } from "@stoker-platform/utils"
import { preloadData } from "./preloadData"
import { WhereFilterOp } from "firebase/firestore"

export const preloadCollection = async (
    collection: StokerCollection,
    constraints?: [string, WhereFilterOp, unknown][],
    rangeConstraints?: PreloadCacheRange,
    orQueries?: [string, WhereFilterOp, unknown][],
    initial?: PreloadCacheInitial,
    tempCache?: string,
) => {
    // eslint-disable-next-line security/detect-object-injection
    const schema = getSchema()
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    const { labels, preloadCache } = collectionSchema

    const state = getLoadingState()
    let location = labels.collection
    if (tempCache) {
        location = tempCache
    }

    /* eslint-disable security/detect-object-injection */
    if (state[location] === "Loading") return

    if (!preloadCache?.roles.includes(permissions.Role)) return
    const collectionPermissions = permissions.collections?.[collection]
    if (
        !(
            (collectionPermissions && collectionAccess("Read", collectionPermissions)) ||
            hasDependencyAccess(collectionSchema, schema, permissions).length > 0
        )
    ) {
        state[location] = "Error"
        return
    }
    state[location] = "Loading"
    const event = new Event(`stoker:loading:${collection}`)
    document.dispatchEvent(event)
    try {
        await preloadData(collectionSchema, constraints, rangeConstraints, orQueries, tempCache)
        if (preloadCache?.relationCollections && !tempCache) {
            const waitForRelationCollections = await tryPromise(preloadCache.relationCollections)
            if (waitForRelationCollections) {
                const relatedCollections = getRelatedCollections(collectionSchema, schema, permissions)
                for (const relatedCollection of relatedCollections) {
                    if (!initial?.[relatedCollection]) {
                        const relatedCollectionSchema = schema.collections[relatedCollection]
                        if (!relatedCollectionSchema.preloadCache?.roles.includes(permissions.Role)) continue
                        const relatedCollectionState = getLoadingState()[relatedCollection]
                        if (
                            relatedCollectionState === "Loading" ||
                            relatedCollectionState === "Loaded" ||
                            relatedCollectionState === "Error"
                        )
                            continue
                        if (!relatedCollectionState) {
                            await preloadCollection(relatedCollection, undefined, undefined, undefined, initial)
                        }
                    }
                }
            }
        }
        state[location] = "Loaded"
        const event = new Event(`stoker:loaded:${collection}`)
        document.dispatchEvent(event)
    } catch (error: unknown) {
        state[location] = "Error"
        throw error
    }
    return
}

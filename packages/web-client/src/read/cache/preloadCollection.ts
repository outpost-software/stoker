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
) => {
    // eslint-disable-next-line security/detect-object-injection
    const schema = getSchema()
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    const { labels, preloadCache } = collectionSchema

    const state = getLoadingState()

    if (state[labels.collection] === "Loading") return

    /* eslint-disable security/detect-object-injection */
    if (!preloadCache?.roles.includes(permissions.Role)) return
    const collectionPermissions = permissions.collections?.[collection]
    if (
        !(
            (collectionPermissions && collectionAccess("Read", collectionPermissions)) ||
            hasDependencyAccess(collectionSchema, schema, permissions).length > 0
        )
    ) {
        state[labels.collection] = "Error"
        return
    }
    state[labels.collection] = "Loading"
    const event = new Event(`stoker:loading:${collection}`)
    document.dispatchEvent(event)
    try {
        await preloadData(collectionSchema, constraints, rangeConstraints, orQueries)
        if (preloadCache?.relationCollections) {
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
        state[labels.collection] = "Loaded"
        const event = new Event(`stoker:loaded:${collection}`)
        document.dispatchEvent(event)
    } catch (error: unknown) {
        state[labels.collection] = "Error"
        throw error
    }
    return
}

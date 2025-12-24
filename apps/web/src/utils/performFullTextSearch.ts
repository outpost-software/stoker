import { CollectionSchema } from "@stoker-platform/types"
import { getApp } from "firebase/app"
import { getFunctions, httpsCallable } from "firebase/functions"

export const performFullTextSearch = async (
    collection: CollectionSchema,
    search: string,
    hitsPerPage: number,
    constraints?: [string, "==" | "in", unknown][],
) => {
    const { labels } = collection
    const firebaseFunctions = getFunctions(getApp(), import.meta.env.STOKER_FB_FUNCTIONS_REGION)
    const searchApi = httpsCallable(firebaseFunctions, `stoker-search`)
    const results = (await searchApi({
        collection: labels.collection,
        query: search,
        hitsPerPage,
        constraints,
    })) as { data: string[] }
    return results.data
}

import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { preloadCacheEnabled } from "./preloadCacheEnabled"
import { Query } from "@/Collection"
import { QueryConstraint, Unsubscribe, where, WhereFilterOp } from "firebase/firestore"
import { getSome, subscribeMany } from "@stoker-platform/web-client"
import { serverReadOnly } from "./serverReadOnly"

export const getData = async (
    collection: CollectionSchema,
    constraints: [string, WhereFilterOp, unknown][],
    setLoading: (loading: boolean) => void,
    setResults: (results: StokerRecord[]) => void,
    setUnsubscribe: (value: React.SetStateAction<Unsubscribe[] | undefined>) => void,
) => {
    const { labels } = collection
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)
    const isServerReadOnly = serverReadOnly(collection)
    if (!isPreloadCacheEnabled) {
        setLoading(true)
    }

    const query: Query = {
        infinite: false,
        queries: [
            {
                constraints: constraints.map((constraint) => where(constraint[0], constraint[1], constraint[2])),
                options: {},
            },
        ],
    }

    return new Promise<void>((resolve, reject) => {
        const subscribe = async () => {
            const currentQuery = query.queries[0]
            try {
                let queryLoaded = false
                let promiseLoaded = false
                let loadedDocs: StokerRecord[]
                let firstLoad = true

                const load = () => {
                    setResults(loadedDocs)
                    setLoading(false)
                    if (firstLoad) {
                        firstLoad = false
                        setUnsubscribe((prev) => [...(prev || []), newUnsubscribe])
                        resolve()
                    }
                }

                // TODO: subcollection support
                const result = await subscribeMany(
                    [labels.collection],
                    currentQuery.constraints as QueryConstraint[],
                    (docs: StokerRecord[]) => {
                        loadedDocs = docs
                        queryLoaded = true
                        if (promiseLoaded) {
                            load()
                        }
                    },
                    (error) => {
                        console.error(error)
                        if (!isPreloadCacheEnabled) {
                            setLoading(false)
                        }
                        resolve()
                    },
                )
                const { unsubscribe: newUnsubscribe } = result
                promiseLoaded = true
                if (queryLoaded) {
                    load()
                }
            } catch (error) {
                if (!isPreloadCacheEnabled) {
                    setLoading(false)
                }
                reject(error)
            }
        }

        const getServerData = async () => {
            // TODO: subcollection support
            const data = await getSome(
                [labels.collection],
                query.queries[0].constraints as [string, WhereFilterOp, unknown][],
            )
            setResults(data.docs)
            setLoading(false)
            resolve()
        }

        if (isServerReadOnly) {
            getServerData()
        } else {
            subscribe()
        }
    })
}

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { createElement, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { serverReadOnly } from "./utils/serverReadOnly"
import {
    getCachedConfigValue,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getLoadingState,
    getSome,
    subscribeMany,
} from "@stoker-platform/web-client"
import { Query } from "./Collection"
import { QueryConstraint, where, WhereFilterOp } from "firebase/firestore"
import { getFilterDisjunctions } from "./utils/getFilterDisjunctions"
import { Unsubscribe } from "firebase/auth"
import { useGoToRecord } from "./utils/goToRecord"
import { performFullTextSearch } from "./utils/performFullTextSearch"
import { localFullTextSearch } from "./utils/localFullTextSearch"
import { useConnection } from "./providers/ConnectionProvider"

export function SearchAllResults({ collection, search }: { collection: CollectionSchema; search: string }) {
    const { labels, fullTextSearch, recordTitleField, softDelete } = collection
    const customization = getCollectionConfigModule(labels.collection)
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")

    const goToRecord = useGoToRecord()
    const [connectionStatus] = useConnection()
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)
    const isServerReadOnly = serverReadOnly(collection)

    const [results, setResults] = useState<StokerRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [isCacheLoading, setIsCacheLoading] = useState(false)
    const [unsubscribe, setUnsubscribe] = useState<Unsubscribe[] | undefined>(undefined)
    const searchResults = useRef<string[] | undefined>(undefined)
    const [title, setTitle] = useState<string | undefined>(undefined)
    const [icon, setIcon] = useState<string | undefined>(undefined)

    const getData = useCallback(async () => {
        if (!isPreloadCacheEnabled) {
            setLoading(true)
        }

        const query: Query = {
            infinite: false,
            queries: [
                {
                    constraints: [],
                    options: {},
                },
            ],
        }

        if (fullTextSearch && !isPreloadCacheEnabled) {
            const disjunctions = getFilterDisjunctions(collection)
            const hitsPerPage = disjunctions === 0 ? 5 : Math.min(5, Math.max(1, Math.floor(30 / disjunctions)))
            const objectIDs = await performFullTextSearch(collection, search, hitsPerPage)
            searchResults.current = objectIDs
            if (objectIDs.length > 0) {
                if (isServerReadOnly) {
                    query.queries[0].constraints = [["id", "in", objectIDs]]
                    if (softDelete) {
                        query.queries[0].constraints.push(["Archived", "==", false])
                    }
                } else {
                    query.queries[0].constraints = [where("id", "in", objectIDs)]
                    if (softDelete) {
                        query.queries[0].constraints.push(where("Archived", "==", false))
                    }
                }
            } else if (search) {
                setResults([])
                setLoading(false)
                return
            }
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
                        if (isPreloadCacheEnabled) {
                            const searchResults = localFullTextSearch(collection, search, loadedDocs)
                            const searchRecords = loadedDocs.filter((doc) =>
                                searchResults.map((result) => result.id).includes(doc.id),
                            )
                            setResults(searchRecords)
                            setLoading(false)
                        } else {
                            setResults(loadedDocs)
                            setLoading(false)
                        }

                        if (firstLoad) {
                            firstLoad = false
                            setUnsubscribe((prev) => [...(prev || []), newUnsubscribe])
                            resolve()
                        }
                    }

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
                        {
                            pagination: {
                                number: 5,
                            },
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
                const data = await getSome(
                    [labels.collection],
                    query.queries[0].constraints as [string, WhereFilterOp, unknown][],
                    {
                        pagination: {
                            number: 5,
                        },
                    },
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
    }, [isPreloadCacheEnabled, isServerReadOnly, unsubscribe, location, search])

    useEffect(() => {
        const initialize = async () => {
            const collectionTitles = await getCachedConfigValue(customization, [
                "collections",
                labels.collection,
                "admin",
                "titles",
            ])
            setTitle(collectionTitles?.collection || labels.collection)
            const icon = await getCachedConfigValue(customization, ["collections", labels.collection, "admin", "icon"])
            setIcon(icon)
        }
        initialize()
    }, [])

    useEffect(() => {
        const timeout = setTimeout(() => {
            getData()
        }, 500)
        return () => {
            clearTimeout(timeout)
            unsubscribe?.forEach((unsubscribe) => unsubscribe())
        }
    }, [search])

    const cacheLoading = useCallback(() => {
        setIsCacheLoading(true)
    }, [])

    const cacheLoaded = useCallback(() => {
        setIsCacheLoading(false)
        getData()
    }, [])

    useEffect(() => {
        if (isPreloadCacheEnabled) {
            const isPreloading = getLoadingState()[labels.collection]
            if (!isPreloading || isPreloading === "Loading") {
                setIsCacheLoading(true)
            }
            document.addEventListener(`stoker:loading:${labels.collection}`, cacheLoading)
            document.addEventListener(`stoker:loaded:${labels.collection}`, cacheLoaded)
        }
        return () => {
            if (isPreloadCacheEnabled) {
                document.removeEventListener(`stoker:loading:${labels.collection}`, cacheLoading)
                document.removeEventListener(`stoker:loaded:${labels.collection}`, cacheLoaded)
            }
        }
    }, [])

    return (
        <div className="h-[240px]">
            <Table className="table-fixed">
                <TableHeader>
                    <TableRow>
                        {/* eslint-disable-next-line security/detect-object-injection */}
                        <TableHead className="w-full">
                            <Suspense fallback={null}>
                                <div className="flex items-center">
                                    {/* eslint-disable security/detect-object-injection */}
                                    {icon ? createElement(icon, { className: "mr-2" }) : null}
                                    {title}
                                    {/* eslint-enable security/detect-object-injection */}
                                </div>
                            </Suspense>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                {connectionStatus === "online" || isPreloadCacheEnabled ? (
                    <TableBody>
                        {loading || (isPreloadCacheEnabled && isCacheLoading) ? (
                            <TableRow className="flex items-center justify-center">
                                <TableCell>
                                    <LoadingSpinner size={7} />
                                </TableCell>
                            </TableRow>
                        ) : (
                            results.map((result: StokerRecord) => (
                                <TableRow key={result.id}>
                                    <TableCell
                                        className="cursor-pointer h-[40px] truncate"
                                        onClick={() => {
                                            setTimeout(() => {
                                                goToRecord(collection, result)
                                            }, 100)
                                        }}
                                    >
                                        {/* eslint-disable-next-line security/detect-object-injection */}
                                        {result[recordTitleField] || result.id}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                ) : (
                    <TableBody>
                        <TableRow className="flex items-center justify-center h-10 text-primary/50">
                            <TableCell>
                                <span>{title} not available in offline mode.</span>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                )}
            </Table>
        </div>
    )
}

import {
    CalendarConfig,
    CardsConfig,
    CollectionField,
    CollectionSchema,
    Filter,
    FormList,
    ImagesConfig,
    ListConfig,
    MapConfig,
    RangeFilter,
    RelationField,
    RelationList,
    StokerCollection,
    StokerRecord,
    StokerRole,
} from "@stoker-platform/types"
import {
    convertDateToTimezone,
    Cursor,
    getCachedConfigValue,
    getCollectionConfigModule,
    getConnectionStatus,
    getCurrentUserPermissions,
    getLoadingState,
    getSchema,
    getSome,
    GetSomeOptions,
    getTimezone,
    keepTimezone,
    subscribeMany,
    SubscribeManyOptions,
    updateRecord,
} from "@stoker-platform/web-client"
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { File, ListFilter, PlusCircle, Search, ChevronsUpDown, Check, Bot, X } from "lucide-react"
import { List } from "./List"
import { Button } from "./components/ui/button"
import { runViewTransition } from "./utils/runViewTransition"
import { useGlobalLoading, useRouteLoading } from "./providers/LoadingProvider"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./components/ui/sheet"
import { SortingState, Table } from "@tanstack/react-table"
import { ToggleGroup, ToggleGroupItem } from "./components/ui/toggle-group"
import { Cards } from "./Cards"
import { Images } from "./Images"
import { useOptimistic } from "./providers/OptimisticProvider"
import { serverReadOnly } from "./utils/serverReadOnly"
import cloneDeep from "lodash/cloneDeep.js"
import { Map as StokerMap } from "./Map"
import { Calendar } from "./Calendar"
import { useStokerState } from "./providers/StateProvider"
import { Filters } from "./Filters"
import { FirestoreError, QueryConstraint, Timestamp, where, WhereFilterOp } from "firebase/firestore"
import { useFilters } from "./providers/FiltersProvider"
import {
    collectionAccess,
    getEntityParentFilters,
    getEntityRestrictions,
    getField,
    getFieldCustomization,
    getRange,
    getSystemFieldsSchema,
    hasDependencyAccess,
    isRelationField,
    isSortingEnabled,
    tryFunction,
    tryPromise,
} from "@stoker-platform/utils"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu"
import { ScrollArea } from "./components/ui/scroll-area"
import { DateRangeSelector } from "./DateRange"
import { useCache } from "./providers/CacheProvider"
import { getOrderBy } from "./utils/getOrderBy"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { localFullTextSearch } from "./utils/localFullTextSearch"
import { TooltipProvider } from "./components/ui/tooltip"
import { Thread } from "./components/assistant-ui/thread"
import { MyRuntimeProvider } from "./providers/RuntimeProvider"
import { getFilterDisjunctions } from "./utils/getFilterDisjunctions"
import { performFullTextSearch } from "./utils/performFullTextSearch"
import { CSVLink } from "react-csv"
import { prepareCSVData } from "./utils/prepareCSVData"
import { sortList } from "./utils/sortList"
import { useConnection } from "./providers/ConnectionProvider"
import { RecordForm } from "./Form"
import { createPortal } from "react-dom"
import { DateTime } from "luxon"
import { cn } from "./lib/utils"
import { Badge } from "./components/ui/badge"
import { getMaxDate, getMinDate } from "./utils/getMaxDateRange"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/ui/command"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { useToast } from "./hooks/use-toast"
import { isServerUpdate } from "./utils/isServerWrite"

interface CollectionProps {
    collection: CollectionSchema
    formList?: FormList
    additionalConstraints?: [string, WhereFilterOp, unknown][]
    itemsPerPage?: number
    defaultSort?: {
        field: string
        direction?: "asc" | "desc"
    }
    relationList?: RelationList
    relationCollection?: CollectionSchema
    relationParent?: StokerRecord
}

export interface Query {
    infinite?: boolean
    queries: {
        constraints: QueryConstraint[] | [string, WhereFilterOp, unknown][]
        options: SubscribeManyOptions | GetSomeOptions
    }[]
}

function Collection({
    collection,
    formList,
    additionalConstraints,
    itemsPerPage: itemsPerPageOverride,
    defaultSort: defaultSortOverride,
    relationList,
    relationCollection,
    relationParent,
}: CollectionProps) {
    const navigate = useNavigate()
    const location = useLocation()
    const [connectionStatus] = useConnection()
    const { labels, fields, access, preloadCache, recordTitleField, softDelete, fullTextSearch, ai } = collection
    const { serverWriteOnly } = access
    const softDeleteField = softDelete?.archivedField

    const schema = getSchema()
    const customization = getCollectionConfigModule(labels.collection)
    const timezone = getTimezone()
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    const { toast } = useToast()

    const isServerReadOnly = serverReadOnly(collection)
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)
    const hasEntityRestrictions = getEntityRestrictions(collection, permissions)
    const hasEntityParentFilters = getEntityParentFilters(collection, schema, permissions)

    const [collectionTitle, setCollectionTitle] = useState("")
    const [recordTitle, setRecordTitle] = useState("")
    const [itemsPerPage, setItemsPerPage] = useState<number | undefined>(itemsPerPageOverride)
    const [statusField, setStatusField] = useState<
        { field: string; active: unknown[]; archived: unknown[] } | undefined
    >(undefined)
    const cardsStatusField = useRef<CollectionField | undefined>(undefined)
    const statusValues = useRef<(string | number)[] | undefined>(undefined)
    const [icon, setIcon] = useState(undefined)
    const [defaultSort, setDefaultSort] = useState<
        | {
              field: string
              direction?: "asc" | "desc"
          }
        | undefined
    >(undefined)

    const [state, setStokerState] = useStokerState()
    const setState = useCallback(
        (key: string, param: string, value: string | number | SortingState) => {
            if (!relationList) {
                setStokerState(key, param, value)
            }
        },
        [relationList],
    )

    const [isInitialized, setIsInitialized] = useState(false)
    const unsubscribe = useRef<{ [key: string | number]: ((direction?: "first" | "last") => void)[] }>({})
    const [cursor, setCursor] = useState<{ [key: string | number]: Cursor | undefined }>({})
    const [prevCursor, setPrevCursor] = useState<{ [key: string | number]: Cursor | undefined }>({})
    const [count, setCount] = useState<{ [key: string | number]: number | undefined }>({})
    const [pages, setPages] = useState<{ [key: string | number]: number | undefined }>({})
    const [list, setList] = useState<{ [key: string | number]: StokerRecord[] | undefined }>({})
    const { optimisticUpdates, optimisticDeletes, setOptimisticUpdate, removeOptimisticUpdate, removeCacheOptimistic } =
        useOptimistic()
    const [serverList, setServerList] = useState<{ [key: string | number]: StokerRecord[] | undefined }>({})
    const { isRouteLoading, isRouteLoadingImmediate, setIsRouteLoading } = useRouteLoading()
    const { setGlobalLoading } = useGlobalLoading()
    const isCacheLoading = useRef(false)
    const cacheLoadingStarted = useRef(false)
    const [cacheLoadingCompleted, setCacheLoadingCompleted] = useState(false)
    const [isOfflineDisabled, setIsOfflineDisabled] = useState<boolean | undefined>(undefined)
    const [restrictExport, setRestrictExport] = useState<StokerRole[] | undefined>(undefined)
    const [disableCreate, setDisableCreate] = useState<boolean>(false)

    const [table, setTable] = useState<Table<StokerRecord> | undefined>(undefined)
    const [listConfig, setListConfig] = useState<ListConfig | undefined>(undefined)
    const [cardsConfig, setCardsConfig] = useState<CardsConfig | undefined>(undefined)
    const [imagesConfig, setImagesConfig] = useState<ImagesConfig | undefined>(undefined)
    const [mapConfig, setMapConfig] = useState<MapConfig | undefined>(undefined)
    const [calendarConfig, setCalendarConfig] = useState<CalendarConfig | undefined>(undefined)

    const [search, setSearch] = useState("")
    const [tab, setTab] = useState<string | undefined>("list")
    const tabRef = useRef<string | undefined>(undefined)
    const prevTabRef = useRef<string | undefined>(undefined)
    const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all" | "trash" | undefined>("active")
    const [firstTabLoadCards, setFirstTabLoadCards] = useState<boolean | undefined>(undefined)
    const [revertingStatusFilter, setRevertingStatusFilter] = useState(false)
    const [rangeSelector, setRangeSelector] = useState<"range" | "week" | "month" | undefined>(undefined)

    const { filters, setFilters, order, setOrder, getFilterConstraints } = useFilters()
    const { orderByField, orderByDirection } = useMemo(() => getOrderBy(collection, order), [order])
    const searchResults = useRef<{ [key: string | number]: string[] | undefined }>({})
    const { currentField: currentFieldAll } = useCache()
    const currentField = currentFieldAll[labels.collection]
    const [backToStartKey, setBackToStartKey] = useState(0)

    const preventChange = isRouteLoadingImmediate.has(location.pathname)

    const onTabChange = useCallback((value: string) => {
        Object.values(unsubscribe.current).forEach((unsubscribe) => unsubscribe.forEach((unsubscribe) => unsubscribe()))
        unsubscribe.current = {}

        setTab((prev) => {
            if (prev === "cards") {
                setRevertingStatusFilter(true)
            }
            return value
        })
        prevTabRef.current = tabRef.current
        tabRef.current = value
        setState(`collection-tab-${labels.collection.toLowerCase()}`, "tab", value)
    }, [])

    const onStatusFilterChange = useCallback(
        (value: string, firstLoad?: boolean) => {
            if (preventChange && !firstLoad) return
            setStatusFilter(value as "active" | "archived" | "all" | "trash")
            setFirstTabLoadCards(false)
            const filterValue = value || "active"
            setFilters((prev) => {
                const updatedFilters = [...prev]
                const statusFilter = updatedFilters.find((filter) => filter.type === "status")
                if (statusFilter) {
                    statusFilter.value = filterValue
                }
                return updatedFilters
            })
            if (value) {
                setState(`collection-status-filter-${labels.collection.toLowerCase()}`, "status-filter", value)
            } else {
                setState(`collection-status-filter-${labels.collection.toLowerCase()}`, "status-filter", "DELETE_STATE")
            }
            setRevertingStatusFilter(false)
        },
        [preventChange, isInitialized],
    )

    const collectionOptimisticUpdates = optimisticUpdates?.get(labels.collection) || []
    const collectionOptimisticUpdatesRef = useRef(collectionOptimisticUpdates)
    const collectionOptimisticDeletes = optimisticDeletes?.get(labels.collection) || []
    const collectionOptimisticDeletesRef = useRef(collectionOptimisticDeletes)

    // Refs need to be used in place of state, as state values will be stale when this function is used in the subscribeMany callback
    const setOptimisticList = useCallback(
        (latestServerList?: StokerRecord[], key?: string | number) => {
            key ||= "default"
            let updatedList: StokerRecord[]
            if (latestServerList) {
                updatedList = [...latestServerList]
            } else {
                // eslint-disable-next-line security/detect-object-injection
                if (!serverListRef.current[key]) return
                // eslint-disable-next-line security/detect-object-injection
                updatedList = [...(serverListRef.current[key] || [])]
            }

            collectionOptimisticUpdatesRef.current.forEach((optimisticRecord) => {
                let isInList = false
                if (tabRef.current === "cards" && cardsStatusField.current && statusValues.current) {
                    let statusValue = optimisticRecord[cardsStatusField.current.name]
                    if (cardsStatusField.current.type === "Boolean") {
                        if (optimisticRecord[cardsStatusField.current.name] === true) {
                            statusValue = statusValues.current[0]
                        } else {
                            statusValue = `Not ${cardsStatusField.current.name}`
                        }
                    }
                    isInList = statusValue.toString() === key
                    if (!isInList) {
                        const index = updatedList.findIndex((record) => record.id === optimisticRecord.id)
                        if (index !== -1) {
                            updatedList.splice(index, 1)
                        }
                    }
                }
                if (tabRef.current !== "cards" || isInList) {
                    const index = updatedList.findIndex((record) => record.id === optimisticRecord.id)
                    if (index !== -1) {
                        // eslint-disable-next-line security/detect-object-injection
                        updatedList[index] = optimisticRecord
                    } else {
                        updatedList.push(optimisticRecord)
                    }
                }
            })

            collectionOptimisticDeletesRef.current.forEach((deletedId) => {
                const index = updatedList.findIndex((record) => record.id === deletedId)
                if (index !== -1) {
                    updatedList.splice(index, 1)
                }
            })
            if (!(isPreloadCacheEnabled && isCacheLoading.current)) {
                setList((prev) => ({ ...prev, [key]: updatedList }))
            }
        },
        [
            isPreloadCacheEnabled,
            serverList.current,
            tabRef.current,
            isCacheLoading.current,
            cardsStatusField.current,
            statusValues.current,
        ],
    )

    const serverListRef = useRef(serverList)
    useEffect(() => {
        serverListRef.current = serverList
    }, [serverList])

    // This is to ensure that the optimistic list is set in cases where cached documents exactly match the downloaded server documents
    // In this case, the cache-only snapshot listener does not fire a second time when the cache has loaded because there is no change to the list
    useEffect(() => {
        if (cacheLoadingCompleted) {
            Object.keys(serverList).forEach((key) => {
                setOptimisticList(undefined, key)
            })
        }
    }, [cacheLoadingCompleted])

    const prevOptimisticCount = useRef<number>(collectionOptimisticUpdates.length)
    const prevOptimisticDeletesCount = useRef<number>(collectionOptimisticDeletes.length)

    useEffect(() => {
        collectionOptimisticUpdatesRef.current = collectionOptimisticUpdates
        collectionOptimisticDeletesRef.current = collectionOptimisticDeletes

        const currentUpdatesCount = collectionOptimisticUpdates.length
        const currentDeletesCount = collectionOptimisticDeletes.length

        if (
            currentUpdatesCount > prevOptimisticCount.current ||
            currentDeletesCount > prevOptimisticDeletesCount.current
        ) {
            Object.keys(serverList).forEach((key) => {
                setOptimisticList(undefined, key)
            })
        }

        prevOptimisticCount.current = currentUpdatesCount
        prevOptimisticDeletesCount.current = currentDeletesCount
    }, [collectionOptimisticUpdates.length, collectionOptimisticDeletes.length])

    const loadedKeys = useRef<Set<string | number>>(new Set())
    const keysLength = useRef(0)
    const getKeysLength = useCallback(() => {
        let length = 1
        if (tab === "cards") {
            length = statusValues.current?.length || 1
            if (!isPreloadCacheEnabled && !isServerReadOnly) {
                length++
            }
        }
        if (tab === "images" && !isPreloadCacheEnabled && !isServerReadOnly) {
            length++
        }
        keysLength.current = length
    }, [tab, isPreloadCacheEnabled, isServerReadOnly, statusValues])

    useEffect(() => {
        if (isPreloadCacheEnabled || isServerReadOnly) {
            Object.keys(list).forEach((key) => {
                if (search) {
                    // eslint-disable-next-line security/detect-object-injection
                    const results = localFullTextSearch(collection, search, list[key] || [])
                    // eslint-disable-next-line security/detect-object-injection
                    searchResults.current[key] = results.map((result) => result.id)
                } else {
                    // eslint-disable-next-line security/detect-object-injection
                    searchResults.current[key] = undefined
                }
            })
        }
    }, [search, list])

    const getData = useCallback(
        async (query: Query, key?: string | number) => {
            const startingTab = tabRef.current
            key ||= "default"

            if (!isPreloadCacheEnabled) {
                setIsRouteLoading("+", location.pathname)
            }

            if (
                fullTextSearch &&
                !isPreloadCacheEnabled &&
                !isServerReadOnly &&
                search &&
                tab !== "map" &&
                tab !== "calendar"
            ) {
                const disjunctions = getFilterDisjunctions(collection)
                const hitsPerPage =
                    disjunctions === 0
                        ? Math.min(30, itemsPerPage || 10)
                        : Math.min(itemsPerPage || 10, Math.max(1, Math.floor(30 / disjunctions)))
                let latestFilters = filters
                if (tab === "cards" && prevTabRef.current !== "cards") {
                    latestFilters = [...filters]
                    if (statusFilter && autoUpdateStatusFilter) {
                        if (statusFilter !== "trash") {
                            const statusFilter = latestFilters.find((filter) => filter.type === "status")
                            if (statusFilter) {
                                statusFilter.value = "all"
                            }
                        }
                    }
                }
                const constraints = getFilterConstraints(latestFilters, false, true) as [string, "==" | "in", unknown][]
                const objectIDs = await performFullTextSearch(collection, search, hitsPerPage, constraints)
                searchResults.current = { ...searchResults.current, [key]: objectIDs }
                if (objectIDs.length > 0) {
                    if (isServerReadOnly) {
                        query.queries = query.queries.map((q) => ({
                            ...q,
                            constraints: [...q.constraints, ["id", "in", objectIDs]] as [
                                string,
                                WhereFilterOp,
                                unknown,
                            ][],
                        }))
                    } else {
                        query.queries = query.queries.map((q) => ({
                            ...q,
                            constraints: [...q.constraints, where("id", "in", objectIDs)] as QueryConstraint[],
                        }))
                    }
                } else if (search) {
                    setServerList((prev) => ({ ...prev, [key]: [] }))
                    setOptimisticList([], key)
                    setIsRouteLoading("-", location.pathname)
                    setCursor({})
                    setPages({})
                    setCount({})
                    return
                }
            }

            return new Promise<void>((resolve, reject) => {
                const subscribe = async () => {
                    let currentQuery:
                        | {
                              constraints: QueryConstraint[] | [string, WhereFilterOp, unknown][]
                              options: SubscribeManyOptions | GetSomeOptions
                          }
                        | undefined = query.queries[0]
                    if (query.infinite) {
                        currentQuery = query.queries.at(-1)
                    }
                    if (!currentQuery) return
                    if (!query.infinite || query.queries.length === 1) {
                        let unsubscribeDirection: "first" | "last"
                        if (currentQuery.options.pagination?.startAfter) {
                            unsubscribeDirection = "last"
                        }
                        if (currentQuery.options.pagination?.endBefore) {
                            unsubscribeDirection = "first"
                        }
                        // eslint-disable-next-line security/detect-object-injection
                        if (unsubscribe.current[key]) {
                            // eslint-disable-next-line security/detect-object-injection
                            unsubscribe.current[key].forEach((unsubscribe) => unsubscribe(unsubscribeDirection))
                            // eslint-disable-next-line security/detect-object-injection
                            unsubscribe.current[key] = []
                        }
                    }
                    try {
                        let queryLoaded = false
                        let promiseLoaded = false
                        let loadedDocs: StokerRecord[]
                        let newCursor: Cursor | undefined
                        let firstLoad = true

                        const load = () => {
                            if (query.infinite) {
                                setServerList((prev) => {
                                    // eslint-disable-next-line security/detect-object-injection
                                    if (!prev[key]) {
                                        setOptimisticList(loadedDocs, key)
                                        return { ...prev, [key]: loadedDocs }
                                    }
                                    // eslint-disable-next-line security/detect-object-injection
                                    const updatedList = prev[key]
                                    if (!updatedList) return prev
                                    const startIndex =
                                        query.queries.indexOf(currentQuery) *
                                        (currentQuery.options.pagination?.number || 10)
                                    for (let i = 0; i < (currentQuery.options.pagination?.number || 10); i++) {
                                        // eslint-disable-next-line security/detect-object-injection
                                        if (loadedDocs[i]) {
                                            // eslint-disable-next-line security/detect-object-injection
                                            const doc = loadedDocs[i]
                                            updatedList[startIndex + i] = doc
                                        } else {
                                            updatedList.splice(startIndex + i, 1)
                                        }
                                    }
                                    setOptimisticList(updatedList, key)
                                    return { ...prev, [key]: updatedList }
                                })
                            } else {
                                setServerList((prev) => ({ ...prev, [key]: loadedDocs }))
                                setOptimisticList(loadedDocs, key)
                            }
                            if (!query.infinite || firstLoad) {
                                setCursor((prev) => ({ ...prev, [key]: newCursor }))
                            }
                            if (!isPreloadCacheEnabled) {
                                loadedKeys.current.add(key)
                                if (loadedKeys.current.size === keysLength.current) {
                                    setIsRouteLoading("-", location.pathname)
                                }
                            }

                            if (firstLoad) {
                                firstLoad = false
                                // eslint-disable-next-line security/detect-object-injection
                                unsubscribe.current[key] ||= []
                                // eslint-disable-next-line security/detect-object-injection
                                unsubscribe.current[key].push(newUnsubscribe)
                                if (!isPreloadCacheEnabled && !isServerReadOnly) {
                                    if (!query.infinite) {
                                        setPages((prev) => ({ ...prev, [key]: newPages || 1 }))
                                    } else {
                                        setCount((prev) => ({ ...prev, [key]: newCount }))
                                    }
                                }
                                resolve()
                            }
                        }

                        // TODO: subcollection support
                        const result = await subscribeMany(
                            [labels.collection],
                            [
                                ...(currentQuery.constraints as QueryConstraint[]),
                                ...(additionalConstraints?.map((constraint) =>
                                    where(constraint[0], constraint[1] as WhereFilterOp, constraint[2]),
                                ) || []),
                            ],
                            (docs: StokerRecord[], cursor?: Cursor) => {
                                loadedDocs = docs
                                newCursor = {
                                    first: new Map(cursor?.first),
                                    last: new Map(cursor?.last),
                                }
                                queryLoaded = true
                                if (promiseLoaded && startingTab === tabRef.current) {
                                    load()
                                }
                            },
                            (error) => {
                                console.error(error)
                                if (!isPreloadCacheEnabled) {
                                    setIsRouteLoading("-", location.pathname)
                                }
                                resolve()
                                if (error instanceof FirestoreError && error.code === "not-found") {
                                    window.location.reload()
                                }
                            },
                            {
                                ...currentQuery.options,
                            } as SubscribeManyOptions,
                        )
                        const { unsubscribe: newUnsubscribe, count: newCount, pages: newPages } = result
                        promiseLoaded = true
                        if (queryLoaded && startingTab === tabRef.current) {
                            load()
                        }
                    } catch (error) {
                        if (!isPreloadCacheEnabled) {
                            setIsRouteLoading("-", location.pathname)
                        }
                        reject(error)
                    }
                }

                const getServerData = async () => {
                    const options = cloneDeep(query.queries[0].options)
                    delete options.pagination
                    // TODO: subcollection support
                    const data = await getSome(
                        [labels.collection],
                        [
                            ...(query.queries[0].constraints as [string, WhereFilterOp, unknown][]),
                            ...(additionalConstraints || []),
                        ],
                        options as GetSomeOptions,
                    )
                    setServerList((prev) => ({ ...prev, [key]: data.docs }))
                    setOptimisticList(data.docs, key)
                    setIsRouteLoading("-", location.pathname)
                    resolve()
                }

                if (isServerReadOnly) {
                    getServerData()
                } else {
                    if (!isPreloadCacheEnabled && cursor) {
                        setPrevCursor((prev) => ({
                            ...prev,
                            [key]: {
                                // eslint-disable-next-line security/detect-object-injection
                                first: new Map(cursor[key]?.first),
                                // eslint-disable-next-line security/detect-object-injection
                                last: new Map(cursor[key]?.last),
                            },
                        }))
                    }
                    subscribe()
                }
            })
        },
        [isPreloadCacheEnabled, isServerReadOnly, unsubscribe, cursor, location, search, tab, itemsPerPage, filters],
    )

    const cacheLoading = useCallback(() => {
        if (!cacheLoadingStarted.current) {
            isCacheLoading.current = true
            setIsRouteLoading("+", location.pathname)
            cacheLoadingStarted.current = true
        }
    }, [location, isCacheLoading.current, cacheLoadingStarted.current])
    const cacheLoaded = useCallback(() => {
        isCacheLoading.current = false
        setIsRouteLoading("-", location.pathname)
        setCacheLoadingCompleted(true)
    }, [location, isCacheLoading.current])

    const hasRunSingleton = useRef(false)

    useEffect(() => {
        if (isPreloadCacheEnabled) {
            const isPreloading = getLoadingState()[labels.collection]
            if (!isPreloading || isPreloading === "Loading") {
                cacheLoading()
                cacheLoadingStarted.current = true
            }
            document.addEventListener(`stoker:loading:${labels.collection}`, cacheLoading)
            // Prevent UI flicker
            document.addEventListener(`stoker:loaded:${labels.collection}`, () => setTimeout(() => cacheLoaded(), 100))
        }

        const getSingleton = async () => {
            if (collection.singleton) {
                // TODO: subcollection support
                const records = await getSome([labels.collection])

                if (records.docs.length > 0) {
                    runViewTransition(() =>
                        navigate(
                            `${records.docs[0].Collection_Path.join("-").toLowerCase()}/${records.docs[0].id}/edit`,
                            {
                                state: {
                                    record: records.docs[0],
                                },
                                replace: true,
                            },
                        ),
                    )
                }
            }
        }

        const initialize = async () => {
            const tabState = state[`collection-tab-${labels.collection.toLowerCase()}`]
            let rangeSelectorState = state[`collection-range-selector-${labels.collection.toLowerCase()}`]
            const searchState = state[`collection-search-${labels.collection.toLowerCase()}`]
            const statusFilterState = state[`collection-status-filter-${labels.collection.toLowerCase()}`]
            const cacheState = state[`collection-range-field-${labels.collection.toLowerCase()}`]
            const rangeState = state[`collection-range-${labels.collection.toLowerCase()}`]
            if (!relationList) {
                if (tabState) {
                    setTab(tabState)
                    tabRef.current = tabState
                    setState(`collection-tab-${labels.collection.toLowerCase()}`, "tab", tabState)
                } else {
                    setTab("list")
                    tabRef.current = "list"
                }
                if (searchState) {
                    setSearch(searchState)
                    setState(`collection-search-${labels.collection.toLowerCase()}`, "search", searchState)
                }
                if (statusFilterState) {
                    setStatusFilter(statusFilterState as "active" | "archived" | "all" | "trash")
                    setState(
                        `collection-status-filter-${labels.collection.toLowerCase()}`,
                        "status-filter",
                        statusFilterState,
                    )
                }
                if (tabState === "cards") {
                    setFirstTabLoadCards(true)
                }
                if (cacheState) {
                    setState(`collection-range-field-${labels.collection.toLowerCase()}`, "field", cacheState)
                }
                if (rangeState) {
                    setState(`collection-range-${labels.collection.toLowerCase()}`, "range", rangeState)
                }
            } else {
                setTab("list")
                tabRef.current = "list"
            }
            if (rangeSelectorState) {
                setRangeSelector(rangeSelectorState as "range" | "week" | "month" | undefined)
                setState(`collection-range-selector-${labels.collection.toLowerCase()}`, "selector", rangeSelectorState)
            }

            const offlineDisabled = await getCachedConfigValue(customization, [
                "collections",
                labels.collection,
                "custom",
                "disableOfflineCreate",
            ])
            setIsOfflineDisabled(offlineDisabled)

            const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                "collections",
                labels.collection,
                "admin",
            ]
            const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
            setCollectionTitle(titles?.collection || labels.collection)
            setRecordTitle(titles?.record || labels.record)
            if (!itemsPerPageOverride) {
                const itemsPerPage = (await getCachedConfigValue(customization, [
                    ...collectionAdminPath,
                    "itemsPerPage",
                ])) as number | undefined
                setItemsPerPage(itemsPerPage)
            }
            const icon = await getCachedConfigValue(customization, [...collectionAdminPath, "icon"])
            setIcon(icon)
            const listConfig = (await getCachedConfigValue(customization, [...collectionAdminPath, "list"])) as
                | ListConfig
                | undefined
            setListConfig(listConfig)
            const cardsConfig = (await getCachedConfigValue(customization, [...collectionAdminPath, "cards"])) as
                | CardsConfig
                | undefined
            setCardsConfig(cardsConfig)
            const imagesConfig = (await getCachedConfigValue(customization, [...collectionAdminPath, "images"])) as
                | ImagesConfig
                | undefined
            setImagesConfig(imagesConfig)
            const mapConfig = (await getCachedConfigValue(customization, [...collectionAdminPath, "map"])) as
                | MapConfig
                | undefined
            setMapConfig(mapConfig)
            const calendarConfig = (await getCachedConfigValue(customization, [...collectionAdminPath, "calendar"])) as
                | CalendarConfig
                | undefined
            setCalendarConfig(calendarConfig)
            const restrictExport = await getCachedConfigValue(customization, [...collectionAdminPath, "restrictExport"])
            setRestrictExport(restrictExport)
            const disableCreate = await getCachedConfigValue(
                customization,
                [...collectionAdminPath, "hideCreate"],
                [relationCollection?.labels.collection],
                true,
            )
            setDisableCreate(!!disableCreate)
            const filters = (await getCachedConfigValue(customization, [...collectionAdminPath, "filters"])) || []

            const statusField = await getCachedConfigValue(customization, [...collectionAdminPath, "statusField"])
            setStatusField(statusField)
            if (!statusFilterState) {
                if (statusField?.active) {
                    setStatusFilter("active")
                } else {
                    setStatusFilter("all")
                }
            }

            const cardsStatusFieldSchema =
                (!isPreloadCacheEnabled && !statusField && cardsConfig?.statusField) ||
                (isPreloadCacheEnabled && cardsConfig?.statusField)
                    ? getField(fields, cardsConfig?.statusField)
                    : getField(fields, statusField?.field)
            cardsStatusField.current = cardsStatusFieldSchema

            const allStatusValues: (string | number)[] = []
            if (cardsStatusFieldSchema) {
                const statusFieldCustomization = getFieldCustomization(cardsStatusFieldSchema, customization)
                if ("values" in cardsStatusFieldSchema && cardsStatusFieldSchema.values) {
                    allStatusValues.push(...cardsStatusFieldSchema.values)
                } else if (cardsStatusFieldSchema.type === "Boolean") {
                    const fieldLabel = tryFunction(statusFieldCustomization.admin?.label) || cardsStatusFieldSchema.name
                    allStatusValues.push(fieldLabel, `Not ${fieldLabel}`)
                }
                statusValues.current = allStatusValues
            }

            const filtersClone = cloneDeep(filters)
            const filtersState = state[`collection-filters-${labels.collection.toLowerCase()}`]
            if (!relationList && filtersState) {
                const filterValues = filtersState.split(",")
                filtersClone.forEach((filter: Filter) => {
                    if (filter.type === "status" || filter.type === "range") {
                        return
                    }
                    const filterValue = filterValues.find((value) => value.split("=")[0] === filter.field)
                    if (filterValue) {
                        const field = getField(fields, filter.field)
                        if (field.type === "Number") {
                            // eslint-disable-next-line security/detect-object-injection
                            filter.value = Number(filterValue.split("=")[1])
                        } else {
                            // eslint-disable-next-line security/detect-object-injection
                            filter.value = filterValue.split("=")[1]
                        }
                    }
                })
            }

            if (statusField || softDelete) {
                if (!relationList && statusFilterState) {
                    filtersClone.push({ type: "status", value: statusFilterState })
                } else if (statusField && statusField.active && statusField.active.length > 0) {
                    filtersClone.push({ type: "status", value: "active" })
                } else {
                    filtersClone.push({ type: "status", value: "all" })
                }
            }

            const rangeFilter = filtersClone.find((filter: Filter) => filter.type === "range") as
                | RangeFilter
                | undefined
            if (!rangeSelectorState) {
                const customization = getCollectionConfigModule(labels.collection)
                const preloadCacheRangeSelector =
                    tryFunction(customization.admin?.rangeSelectorValues) || preloadCache?.range?.selector
                const selector = tryFunction(rangeFilter?.selector) || preloadCacheRangeSelector
                if (Array.isArray(selector)) {
                    const defaultSelector = tryFunction(customization.admin?.defaultRangeSelector) || selector[0]
                    setRangeSelector(defaultSelector)
                    rangeSelectorState = defaultSelector
                } else {
                    setRangeSelector(selector || "range")
                    rangeSelectorState = selector || "range"
                }
            }
            if (currentField && (!rangeFilter || isPreloadCacheEnabled)) {
                let rangeValue = rangeState
                if (preloadCache?.range) {
                    if (!rangeValue) {
                        if (formList) {
                            rangeValue = JSON.stringify({
                                from: getMinDate(),
                                to: getMaxDate(),
                            })
                        } else {
                            const now = convertDateToTimezone(new Date())
                            if (rangeSelectorState === "month") {
                                rangeValue = JSON.stringify({
                                    from: now
                                        .startOf("month")
                                        .plus({ days: preloadCache.range.startOffsetDays || 0 })
                                        .plus({ hours: preloadCache.range.startOffsetHours })
                                        .toJSDate()
                                        .toISOString(),
                                    to: now
                                        .endOf("month")
                                        .plus({ days: preloadCache.range.endOffsetDays || 0 })
                                        .plus({ hours: preloadCache.range.endOffsetHours })
                                        .toJSDate()
                                        .toISOString(),
                                })
                            } else if (rangeSelectorState === "week") {
                                rangeValue = JSON.stringify({
                                    from: now
                                        .startOf("week")
                                        .plus({ days: preloadCache.range.startOffsetDays || 0 })
                                        .plus({ hours: preloadCache.range.startOffsetHours })
                                        .toJSDate()
                                        .toISOString(),
                                    to: now
                                        .endOf("week")
                                        .plus({ days: preloadCache.range.endOffsetDays || 0 })
                                        .plus({ hours: preloadCache.range.endOffsetHours })
                                        .toJSDate()
                                        .toISOString(),
                                })
                            } else {
                                const preloadCacheRange = getRange(preloadCache.range, timezone)
                                rangeValue = JSON.stringify({
                                    from: preloadCacheRange.start.toISOString(),
                                    to: preloadCacheRange.end?.toISOString(),
                                })
                            }
                        }
                    }
                    filtersClone.push({
                        type: "range",
                        field: currentField,
                        value: rangeValue,
                        selector: rangeSelectorState || "range",
                    })
                }
            } else if (rangeFilter && !isPreloadCacheEnabled) {
                let rangeValue = rangeState || rangeFilter.value
                if (formList) {
                    rangeValue = JSON.stringify({
                        from: getMinDate(),
                        to: getMaxDate(),
                    })
                } else if (!rangeValue) {
                    const now = convertDateToTimezone(new Date())
                    const rangeFilterRange = getRange(
                        {
                            fields: [rangeFilter.field],
                            start:
                                rangeSelectorState === "month"
                                    ? now
                                          .startOf("month")
                                          .plus({ days: rangeFilter.startOffsetDays || 0 })
                                          .plus({ hours: rangeFilter.startOffsetHours })
                                          .toJSDate()
                                    : rangeSelectorState === "week"
                                      ? now
                                            .startOf("week")
                                            .plus({ days: rangeFilter.startOffsetDays || 0 })
                                            .plus({ hours: rangeFilter.startOffsetHours })
                                            .toJSDate()
                                      : "Today",
                            end:
                                rangeSelectorState === "month"
                                    ? now
                                          .endOf("month")
                                          .plus({ days: rangeFilter.endOffsetDays || 0 })
                                          .plus({ hours: rangeFilter.endOffsetHours })
                                          .toJSDate()
                                    : rangeSelectorState === "week"
                                      ? now
                                            .endOf("week")
                                            .plus({ days: rangeFilter.endOffsetDays || 0 })
                                            .plus({ hours: rangeFilter.endOffsetHours })
                                            .toJSDate()
                                      : now
                                            .plus({ days: 7 })
                                            .plus({ days: rangeFilter.endOffsetDays || 0 })
                                            .plus({ hours: rangeFilter.endOffsetHours })
                                            .toJSDate(),
                        },
                        timezone,
                    )
                    rangeValue = JSON.stringify({
                        from: rangeFilterRange.start.toISOString(),
                        to: rangeFilterRange.end?.toISOString(),
                    })
                }
                rangeFilter.value = rangeValue
            }

            const filterParam = filtersClone
                .filter((filter: Filter) => filter.type !== "status" && filter.type !== "range" && filter.value)
                .map((filter: Filter) => {
                    if (filter.type !== "status" && filter.type !== "range" && filter.value) {
                        return `${filter.field}=${filter.value.toString()}`
                    }
                    return ""
                })

            if (filterParam.length > 0) {
                setState(`collection-filters-${labels.collection.toLowerCase()}`, "filters", filterParam.join(","))
            }
            if (statusField) {
                const statusFilterIndex = filtersClone.findIndex(
                    (filter: Filter) => filter.type !== "status" && filter.field === statusField.field,
                )
                if (statusFilterIndex !== -1) {
                    filtersClone.splice(statusFilterIndex, 1)
                }
            }
            setFilters(filtersClone)

            const defaultSort = (await getCachedConfigValue(customization, [...collectionAdminPath, "defaultSort"])) as
                | {
                      field: string
                      direction?: "asc" | "desc"
                  }
                | undefined
            setDefaultSort(defaultSortOverride || defaultSort)
            const sortState = state[`collection-sort-${labels.collection.toLowerCase()}`]
            if (sortState && !relationList) {
                const newSorting = JSON.parse(sortState)
                setOrder({ field: newSorting[0].id, direction: newSorting[0].desc ? "desc" : "asc" })
            } else if (defaultSortOverride) {
                setOrder({ field: defaultSortOverride.field, direction: defaultSortOverride.direction || "asc" })
            } else if (defaultSort) {
                setOrder({ field: defaultSort.field, direction: defaultSort.direction || "asc" })
            } else if (recordTitleField) {
                setOrder({ field: recordTitleField, direction: "asc" })
            }

            setIsInitialized(true)
        }

        if (collection.singleton && !hasRunSingleton.current) {
            hasRunSingleton.current = true
            getSingleton()
        } else {
            initialize()
        }

        return () => {
            Object.values(unsubscribe.current).forEach((unsubscribe) =>
                unsubscribe.forEach((unsubscribe) => unsubscribe()),
            )
            unsubscribe.current = {}
            if (isPreloadCacheEnabled) {
                document.removeEventListener(`stoker:loading:${labels.collection}`, cacheLoading)
                document.removeEventListener(`stoker:loaded:${labels.collection}`, cacheLoaded)
            }
        }
    }, [])

    useEffect(() => {
        if (isInitialized) {
            loadedKeys.current = new Set()
            getKeysLength()
        }
    }, [tab, isInitialized])

    const onChangeSearch = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setSearch(event.target.value)
            if (event.target.value) {
                setState(`collection-search-${labels.collection.toLowerCase()}`, "search", event.target.value)
            } else {
                setState(`collection-search-${labels.collection.toLowerCase()}`, "search", "DELETE_STATE")
            }
        },
        [table, recordTitleField, isPreloadCacheEnabled, isServerReadOnly],
    )

    const excludedFilters = useMemo(() => {
        const excluded = []
        if (
            tab === "cards" &&
            ((isPreloadCacheEnabled && cardsConfig?.statusField && cardsConfig.statusField !== statusField?.field) ||
                (!isPreloadCacheEnabled && !statusField?.field && cardsConfig?.statusField))
        ) {
            const cardsStatusFilter = filters.find(
                (filter) => filter.type !== "status" && filter.field === cardsConfig.statusField,
            )
            if (cardsStatusFilter && cardsStatusFilter.type !== "status") {
                excluded.push(cardsStatusFilter.field)
            }
        }
        if (relationList) {
            filters.forEach((filter) => {
                if (filter.type === "relation") {
                    if (!isPreloadCacheEnabled || filter.field === relationList.field) {
                        excluded.push(filter.field)
                    }
                }
            })
        }
        return excluded
    }, [isPreloadCacheEnabled, cardsConfig, statusField, tab])

    const filtersActive = useMemo(() => {
        return (
            filters
                .filter((filter) => filter.type !== "status" && filter.type !== "range")
                .filter((filter) => filter.value)
                .filter((filter) => !excludedFilters.includes(filter.field)).length > 0
        )
    }, [filters, excludedFilters])

    const hasFiltersToShow = useMemo(() => {
        if (!permissions.Role) return false
        const userRole = permissions.Role
        return filters.some((filter) => {
            if (filter.type === "status" || filter.type === "range") return false

            if (excludedFilters.includes(filter.field)) return false

            const field = getField(fields, filter.field)
            if (!field) return false

            if (filter.roles && !filter.roles.includes(userRole)) return false

            if (filter.type === "relation") {
                if (!isRelationField(field)) return false
                const relationCollection = schema.collections[field.collection]
                if (!relationCollection || !relationCollection.fullTextSearch) return false
                const collectionPermissions = permissions?.collections?.[relationCollection.labels.collection]
                const fullCollectionAccess = collectionPermissions && collectionAccess("Read", collectionPermissions)
                const dependencyAccess = hasDependencyAccess(relationCollection, schema, permissions)
                if (!fullCollectionAccess && dependencyAccess.length === 0) return false
            }

            return true
        })
    }, [filters, excludedFilters, fields, permissions, schema])

    const hasRangeFilter = useMemo(() => {
        return filters.some((filter) => filter.type === "range" && !isPreloadCacheEnabled)
    }, [filters])

    const sortingFields = useMemo(
        () =>
            fields.filter((field) => {
                if (["ManyToOne", "ManyToMany"].includes(field.type)) return false
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                return (
                    isPreloadCacheEnabled ||
                    isServerReadOnly ||
                    (isSortingEnabled(field, permissions) && field.type !== "Computed") ||
                    field.name === recordTitleField
                )
            }),
        [fields, recordTitleField, customization, isPreloadCacheEnabled, isServerReadOnly, permissions.Role],
    )

    let sortingHeight = "h-[224px]"
    if (sortingFields.length < 7) {
        switch (sortingFields.length) {
            case 1:
                sortingHeight = "h-[32px]"
                break
            case 2:
                sortingHeight = "h-[64px]"
                break
            case 3:
                sortingHeight = "h-[96px]"
                break
            case 4:
                sortingHeight = "h-[128px]"
                break
            case 5:
                sortingHeight = "h-[160px]"
                break
            case 6:
                sortingHeight = "h-[192px]"
                break
        }
    }

    const autoUpdateStatusFilter = useMemo(() => {
        return !(isPreloadCacheEnabled && cardsConfig?.statusField && cardsConfig.statusField !== statusField?.field)
    }, [isPreloadCacheEnabled, cardsConfig, statusField])

    const showCards = useMemo(() => {
        if (!cardsConfig || !permissions.Role) return false
        if (cardsConfig.roles && !cardsConfig.roles.includes(permissions.Role)) return false
        return true
    }, [cardsConfig, permissions.Role])

    const showImages = useMemo(() => {
        if (!imagesConfig || !permissions.Role) return false
        if (imagesConfig.roles && !imagesConfig.roles.includes(permissions.Role)) return false
        return imagesConfig?.imageField && fields.map((field) => field.name).includes(imagesConfig.imageField)
    }, [imagesConfig, permissions.Role])

    const showMap = useMemo(() => {
        if (!mapConfig || !permissions.Role) return false
        if (mapConfig.roles && !mapConfig.roles.includes(permissions.Role)) return false
        return (
            (mapConfig?.addressField && fields.map((field) => field.name).includes(mapConfig.addressField)) ||
            (mapConfig?.coordinatesField && fields.map((field) => field.name).includes(mapConfig.coordinatesField))
        )
    }, [mapConfig])

    const showCalendar = useMemo(() => {
        if (!calendarConfig || !permissions.Role) return false
        if (calendarConfig.roles && !calendarConfig.roles.includes(permissions.Role)) return false
        const systemFieldsSchema = getSystemFieldsSchema()
        const resourceField = getField(fields, calendarConfig?.resourceField)
        return (
            calendarConfig?.startField &&
            fields
                .concat(systemFieldsSchema)
                .map((field) => field.name)
                .includes(calendarConfig.startField) &&
            (!calendarConfig?.endField ||
                fields
                    .concat(systemFieldsSchema)
                    .map((field) => field.name)
                    .includes(calendarConfig.endField)) &&
            (!calendarConfig?.allDayField || fields.map((field) => field.name).includes(calendarConfig.allDayField)) &&
            (!calendarConfig?.resourceField ||
                (resourceField && (!isRelationField(resourceField) || schema.collections[resourceField.collection])))
        )
    }, [calendarConfig, schema])

    const canAddRecords =
        permissions.collections?.[labels.collection].operations.includes("Create") &&
        !hasEntityRestrictions.some((entityRestriction) => entityRestriction.type === "Individual") &&
        !disableCreate
    const isCreateDisabled = getConnectionStatus() === "Offline" && (isOfflineDisabled || serverWriteOnly)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [csvData, setCsvData] = useState<{ data: StokerRecord[]; headers: any[] } | undefined>(undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csvLinkRef = useRef<any>(null)

    const handleExport = useCallback(async () => {
        if (isPreloadCacheEnabled) {
            if (!list.default?.length) return
            const data = await prepareCSVData(collection, list.default)
            data.data = sortList(
                collection,
                data.data,
                orderByField,
                orderByDirection,
                relationCollection,
                relationParent,
            )
            setCsvData(data)
        } else {
            setIsRouteLoading("+", location.pathname)
            const constraints = getFilterConstraints(undefined, true)
            const { orderByField, orderByDirection } = getOrderBy(collection, order)
            let finalConstraints
            if (isServerReadOnly) {
                finalConstraints = [
                    ...(constraints as [string, WhereFilterOp, unknown][]),
                    ...(additionalConstraints || []),
                ]
            } else {
                finalConstraints = [
                    ...(constraints as QueryConstraint[]),
                    ...(additionalConstraints?.map((constraint) =>
                        where(constraint[0], constraint[1], constraint[2]),
                    ) || []),
                ]
            }
            // TODO: subcollection support
            const serverData = await getSome(
                [labels.collection],
                finalConstraints,
                isServerReadOnly
                    ? undefined
                    : {
                          pagination: { orderByField, orderByDirection, number: 10000 },
                      },
            )
            if (!serverData.docs.length) return
            const data = await prepareCSVData(collection, serverData.docs)
            if (isServerReadOnly) {
                data.data = sortList(
                    collection,
                    data.data,
                    orderByField,
                    orderByDirection,
                    relationCollection,
                    relationParent,
                )
            }
            setCsvData(data)
            setIsRouteLoading("-", location.pathname)
        }
    }, [collection, list.default, isPreloadCacheEnabled, isServerReadOnly, filters, location.pathname])

    useEffect(() => {
        if (csvData && csvLinkRef.current) {
            csvLinkRef.current.link.click()
            setCsvData(undefined)
        }
    }, [csvData])

    useEffect(() => {
        if (rangeSelector) {
            setState(`collection-range-selector-${labels.collection.toLowerCase()}`, "selector", rangeSelector)
        }
    }, [rangeSelector])

    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
    const [selectedDateRange, setSelectedDateRange] = useState<{ startDate: Date; endDate?: Date } | null>(null)

    const handleCalendarDateSelection = useCallback((dateSelectionData: { startDate: Date; endDate?: Date }) => {
        setSelectedDateRange(dateSelectionData)
        setIsCreateDialogOpen(true)
    }, [])

    const createPrePopulatedRecord = useCallback(() => {
        const prePopulatedRecord: Partial<StokerRecord> = {}

        if (selectedDateRange && calendarConfig) {
            if (calendarConfig.startField) {
                const startDate = keepTimezone(
                    DateTime.fromJSDate(selectedDateRange.startDate).setZone(timezone).toJSDate(),
                    timezone,
                )
                prePopulatedRecord[calendarConfig.startField] = Timestamp.fromDate(startDate)
            }

            if (calendarConfig.endField && selectedDateRange.endDate) {
                const endDate = keepTimezone(
                    DateTime.fromJSDate(selectedDateRange.endDate).setZone(timezone).toJSDate(),
                    timezone,
                )
                prePopulatedRecord[calendarConfig.endField] = Timestamp.fromDate(endDate)
            }
        }

        if (relationList && relationParent) {
            const relationFieldSchema = getField(fields, relationList.field)
            if (relationFieldSchema && isRelationField(relationFieldSchema)) {
                const value: Record<string, StokerRecord> = {}
                value[relationParent.id] = relationParent
                // eslint-disable-next-line security/detect-object-injection
                prePopulatedRecord[relationList.field] = value
            }
        }

        if (Object.keys(prePopulatedRecord).length === 0) return
        return prePopulatedRecord as StokerRecord
    }, [selectedDateRange, calendarConfig])

    const mainContentRef = useRef<HTMLDivElement>(null)
    const addButtonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (isCreateDialogOpen) {
            const originalOverflow = document.body.style.overflow
            document.body.style.overflow = "hidden"
            return () => {
                document.body.style.overflow = originalOverflow
            }
        }
        return
    }, [isCreateDialogOpen])

    const [showSelectExisting, setShowSelectExisting] = useState(false)
    const [selectableData, setSelectableData] = useState<StokerRecord[]>([])
    const [selectableSearch, setSelectableSearch] = useState("")
    const [selectLoading, setSelectLoading] = useState(false)
    const [selectLoadingImmediate, setSelectLoadingImmediate] = useState(false)
    const selectDebounceTimeout = useRef<NodeJS.Timeout>()

    const fetchSelectableRecords = useCallback(
        async (query?: string) => {
            if (!relationList) return

            setSelectLoadingImmediate(true)

            clearTimeout(selectDebounceTimeout.current)

            setSelectLoading(false)

            selectDebounceTimeout.current = setTimeout(() => {
                setSelectLoading(true)
            }, 500)

            try {
                const serverConstraints: [string, WhereFilterOp, unknown][] = []
                const webConstraints: QueryConstraint[] = []
                const pushConstraint = (field: string, operation: WhereFilterOp, value: unknown) => {
                    if (isServerReadOnly) {
                        serverConstraints.push([field, operation, value])
                    } else {
                        webConstraints.push(where(field, operation, value))
                    }
                }

                if (softDelete?.archivedField) {
                    pushConstraint(softDelete.archivedField, "==", false)
                }

                if (fullTextSearch && !isPreloadCacheEnabled && query) {
                    const disjunctions = getFilterDisjunctions(collection)
                    const hitsPerPage =
                        disjunctions === 0 ? 10 : Math.min(10, Math.max(1, Math.floor(30 / disjunctions)))
                    const objectIDs = await performFullTextSearch(
                        collection,
                        query,
                        hitsPerPage,
                        serverConstraints as [string, "==" | "in", unknown][],
                    )
                    if (objectIDs.length > 0) {
                        pushConstraint("id", "in", objectIDs)
                    } else if (query) {
                        setSelectableData([])
                        setSelectLoading(false)
                        setSelectLoadingImmediate(false)
                        clearTimeout(selectDebounceTimeout.current)
                        return
                    }
                }

                // TODO: subcollection support
                const data = await getSome(
                    [labels.collection],
                    (isServerReadOnly ? serverConstraints : webConstraints) as
                        | [string, WhereFilterOp, unknown][]
                        | QueryConstraint[],
                    {
                        only: isPreloadCacheEnabled ? "cache" : undefined,
                        pagination: isPreloadCacheEnabled ? undefined : { number: 10 },
                        noEmbeddingFields: true,
                    },
                )

                const parentId = relationParent?.id
                const relationArrayField = `${relationList.field}_Array`
                const filtered = data.docs.filter((doc) => {
                    // eslint-disable-next-line security/detect-object-injection
                    const array = doc[relationArrayField] as string[] | undefined
                    return !array?.includes(parentId)
                })

                if (isPreloadCacheEnabled && query) {
                    const searchResults = localFullTextSearch(collection, query, filtered)
                    const objectIds = searchResults.map((result) => result.id)
                    setSelectableData(filtered.filter((doc) => objectIds.includes(doc.id)).slice(0, 10))
                } else {
                    setSelectableData(filtered)
                }
            } finally {
                setSelectLoading(false)
                setSelectLoadingImmediate(false)
                clearTimeout(selectDebounceTimeout.current)
            }
        },
        [isPreloadCacheEnabled, isServerReadOnly, fullTextSearch],
    )

    const linkExistingRecord = useCallback(
        async (record: StokerRecord) => {
            if (!relationList || !relationParent) return
            const relationCollection = schema.collections[relationList.collection]
            const isRelationServerWrite = isServerUpdate(relationCollection, record)
            const isRelationServerReadOnly = serverReadOnly(relationCollection)
            const relationField = getField(relationCollection.fields, relationList.field) as RelationField

            const updatedFields = {
                [relationList.field]: {
                    // eslint-disable-next-line security/detect-object-injection
                    ...(record[relationList.field] || {}),
                    [relationParent.id]: { Collection_Path: relationParent.Collection_Path },
                },
            }
            if (relationField.includeFields) {
                for (const includeField of relationField.includeFields) {
                    // eslint-disable-next-line security/detect-object-injection
                    updatedFields[relationList.field][relationParent.id][includeField] = relationParent[includeField]
                }
            }

            const optimisticUpdate = {
                ...record,
                ...updatedFields,
            }
            setOptimisticUpdate(relationCollection.labels.collection, optimisticUpdate)

            const originalRecord = cloneDeep(record)
            setGlobalLoading(
                "+",
                record.id,
                isRelationServerWrite,
                !(isRelationServerWrite || isRelationServerReadOnly),
            )
            updateRecord(record.Collection_Path, record.id, updatedFields, undefined, undefined, originalRecord)
                .then(() => {
                    if (isRelationServerWrite || isRelationServerReadOnly) {
                        if (isRelationServerReadOnly) {
                            setBackToStartKey((prev) => prev + 1)
                        }
                        toast({
                            // eslint-disable-next-line security/detect-object-injection
                            description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} updated successfully.`,
                        })
                    }
                    removeOptimisticUpdate(relationCollection.labels.collection, record.id)
                })
                .catch((error) => {
                    console.error(error)
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} failed to update.`,
                        variant: "destructive",
                    })
                    removeOptimisticUpdate(relationCollection.labels.collection, record.id)
                    setOptimisticList()
                })
                .finally(() => {
                    setGlobalLoading("-", record.id, undefined, !(isRelationServerWrite || isRelationServerReadOnly))
                })
            if (!isRelationServerWrite && !isRelationServerReadOnly) {
                toast({
                    // eslint-disable-next-line security/detect-object-injection
                    description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} updated.`,
                })
            }
            removeCacheOptimistic(relationCollection, record)

            setShowSelectExisting(false)
            setSelectableSearch("")
            setSelectableData([])
        },
        [recordTitle],
    )

    return (
        !collection.singleton && (
            <>
                <div
                    ref={mainContentRef}
                    tabIndex={isCreateDialogOpen ? -1 : undefined}
                    className={cn("flex flex-col", relationList ? "xl:gap-4 xl:pt-4" : "lg:gap-4 lg:pt-4")}
                >
                    {!formList && (
                        <header
                            className={cn(
                                "sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 py-1 print:border-none select-none",
                                relationList
                                    ? "xl:static xl:h-auto xl:border-0 xl:bg-transparent xl:px-6 xl:py-0 rounded-tr-lg"
                                    : "lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-6 lg:py-0",
                            )}
                        >
                            <Card className="flex items-center gap-2 h-12 sm:min-w-[300px] p-5">
                                {icon ? createElement(icon) : null}
                                <h1>{collectionTitle}</h1>
                            </Card>
                            {(connectionStatus === "online" || isPreloadCacheEnabled) && (
                                <>
                                    {tab !== "calendar" && (hasRangeFilter || currentField) && (
                                        <div
                                            className={cn(
                                                "hidden",
                                                relationList ? "xl:flex" : "lg:flex",
                                                "2xl:hidden absolute",
                                                relationList ? "left-[calc(50%+98px)]" : "left-1/2",
                                                "transform -translate-x-1/2",
                                            )}
                                        >
                                            <DateRangeSelector
                                                collection={collection}
                                                rangeSelector={rangeSelector}
                                                setRangeSelector={setRangeSelector}
                                                relationList={!!relationList}
                                            />
                                        </div>
                                    )}
                                    <div className="relative ml-auto flex-1 md:grow-0 print:hidden flex items-center">
                                        {tab !== "calendar" &&
                                            tab !== "map" &&
                                            !hasRangeFilter &&
                                            (((isPreloadCacheEnabled || isServerReadOnly) && recordTitleField) ||
                                                (!isPreloadCacheEnabled &&
                                                    !isServerReadOnly &&
                                                    fullTextSearch &&
                                                    !hasEntityRestrictions?.length &&
                                                    !hasEntityParentFilters?.length)) && (
                                                <div className="relative flex-1">
                                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                                    <Input
                                                        type="search"
                                                        value={search}
                                                        onChange={onChangeSearch}
                                                        placeholder="Search..."
                                                        className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[260px] xl:w-[320px]"
                                                    />
                                                    {search && (
                                                        <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 block h-3 w-3 rounded-full bg-destructive"></span>
                                                    )}
                                                </div>
                                            )}
                                        {ai?.chat && ai.chat.roles.includes(permissions.Role) && (
                                            <Sheet>
                                                <SheetTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        disabled={connectionStatus === "offline"}
                                                        className="ml-2 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                                                    >
                                                        <Bot className="h-4 w-4" />
                                                    </Button>
                                                </SheetTrigger>
                                                <SheetContent>
                                                    <div className="h-full">
                                                        <MyRuntimeProvider collection={collection}>
                                                            <TooltipProvider>
                                                                <Thread />
                                                            </TooltipProvider>
                                                        </MyRuntimeProvider>
                                                    </div>
                                                </SheetContent>
                                            </Sheet>
                                        )}
                                    </div>
                                </>
                            )}
                        </header>
                    )}
                    {!(connectionStatus === "online" || isPreloadCacheEnabled) ? (
                        <div
                            className={cn(
                                "flex justify-center items-center p-5",
                                formList ? "h-auto" : "h-[calc(100vh-300px)]",
                            )}
                        >
                            <Card
                                className={cn(
                                    "w-full lg:w-auto lg:min-w-[750px] text-center",
                                    formList ? "lg:min-w-[500px]" : "",
                                )}
                            >
                                <CardHeader>
                                    <CardTitle>You are offline.</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    The {collectionTitle} module is not available in offline mode.
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <main
                            className={cn(
                                "grid flex-1 items-start gap-4 p-4",
                                relationList ? "xl:px-6 xl:py-0 md:gap-8" : "lg:px-6 lg:py-0 md:gap-8",
                            )}
                        >
                            <Tabs defaultValue="list" onValueChange={onTabChange} value={tab}>
                                <div
                                    className={cn(
                                        "flex flex-col items-center print:hidden select-none",
                                        relationList ? "xl:flex-row" : "lg:flex-row",
                                    )}
                                >
                                    {formList && (
                                        <Badge variant="outline" className="py-2 px-4 text-md">
                                            {formList.label || formList.collection}
                                        </Badge>
                                    )}
                                    <div className="lg:h-9">
                                        {!formList && (showCards || showImages || showMap || showCalendar) && (
                                            <TabsList>
                                                <TabsTrigger value="list">{listConfig?.title || "List"}</TabsTrigger>
                                                {showCards && cardsStatusField.current && (
                                                    <TabsTrigger value="cards">
                                                        {cardsConfig?.title || "Board"}
                                                    </TabsTrigger>
                                                )}
                                                {showImages && (
                                                    <TabsTrigger value="images">
                                                        {imagesConfig?.title || "Pics"}
                                                    </TabsTrigger>
                                                )}
                                                {showMap && (
                                                    <TabsTrigger value="map">{mapConfig?.title || "Map"}</TabsTrigger>
                                                )}
                                                {showCalendar && (
                                                    <TabsTrigger value="calendar">
                                                        {calendarConfig?.title || "Calendar"}
                                                    </TabsTrigger>
                                                )}
                                            </TabsList>
                                        )}
                                    </div>
                                    {!formList && tab !== "calendar" && (hasRangeFilter || currentField) && (
                                        <div
                                            className={cn(
                                                relationList
                                                    ? "xl:hidden 2xl:flex xl:absolute xl:left-[calc(50%+128px)] xl:transform xl:-translate-x-[calc(50%+98px)] xl:mt-0 mt-2"
                                                    : "lg:hidden 2xl:flex lg:absolute lg:left-1/2 lg:transform lg:-translate-x-1/2 lg:mt-0 mt-2",
                                            )}
                                        >
                                            <DateRangeSelector
                                                collection={collection}
                                                rangeSelector={rangeSelector}
                                                setRangeSelector={setRangeSelector}
                                                relationList={!!relationList}
                                            />
                                        </div>
                                    )}
                                    <div
                                        className={cn(
                                            "ml-auto flex items-center gap-2 justify-center w-full",
                                            relationList
                                                ? "xl:justify-end xl:mt-0 mt-2"
                                                : "lg:justify-end lg:mt-0 mt-2",
                                        )}
                                    >
                                        {(statusField || softDeleteField) && (
                                            <ToggleGroup
                                                onValueChange={onStatusFilterChange}
                                                value={statusFilter}
                                                defaultValue="active"
                                                size="sm"
                                                type="single"
                                                variant="outline"
                                                className="text-muted-foreground font-medium mr-2 gap-2"
                                            >
                                                {statusField?.active &&
                                                    (tab !== "cards" || !autoUpdateStatusFilter) && (
                                                        <ToggleGroupItem
                                                            className="h-7 bg-muted data-[state=on]:bg-background"
                                                            value="active"
                                                            aria-label="Toggle active"
                                                            disabled={isRouteLoading.has(location.pathname)}
                                                        >
                                                            Active
                                                        </ToggleGroupItem>
                                                    )}
                                                {statusField?.archived &&
                                                    (tab !== "cards" || !autoUpdateStatusFilter) && (
                                                        <ToggleGroupItem
                                                            className="hidden sm:flex h-7 bg-muted data-[state=on]:bg-background relative"
                                                            value="archived"
                                                            aria-label="Toggle archived"
                                                            disabled={isRouteLoading.has(location.pathname)}
                                                        >
                                                            Archived
                                                            {statusFilter === "archived" && (
                                                                <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 block h-3 w-3 rounded-full bg-destructive"></span>
                                                            )}
                                                        </ToggleGroupItem>
                                                    )}
                                                <ToggleGroupItem
                                                    className="h-7 bg-muted data-[state=on]:bg-background relative"
                                                    value="all"
                                                    aria-label="Toggle all"
                                                    disabled={isRouteLoading.has(location.pathname)}
                                                >
                                                    All
                                                    {statusField &&
                                                        statusFilter === "all" &&
                                                        tab !== "cards" &&
                                                        !revertingStatusFilter && (
                                                            <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 block h-3 w-3 rounded-full bg-destructive"></span>
                                                        )}
                                                </ToggleGroupItem>
                                                {softDeleteField && (
                                                    <ToggleGroupItem
                                                        className="h-7 bg-muted data-[state=on]:bg-background relative"
                                                        value="trash"
                                                        aria-label="Toggle trash"
                                                        disabled={isRouteLoading.has(location.pathname)}
                                                    >
                                                        Trash
                                                        {statusFilter === "trash" && (
                                                            <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 block h-3 w-3 rounded-full bg-destructive"></span>
                                                        )}
                                                    </ToggleGroupItem>
                                                )}
                                            </ToggleGroup>
                                        )}
                                        {!formList &&
                                            tab === "list" &&
                                            (!restrictExport || restrictExport.includes(permissions.Role)) && (
                                                <>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={
                                                            !list.default?.length ||
                                                            isRouteLoading.has(location.pathname)
                                                        }
                                                        className="hidden sm:flex h-7 gap-1"
                                                        onClick={handleExport}
                                                    >
                                                        <File className="h-3.5 w-3.5" />
                                                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                                            Export
                                                        </span>
                                                    </Button>
                                                    <CSVLink
                                                        ref={csvLinkRef}
                                                        className="hidden"
                                                        data={csvData?.data || []}
                                                        headers={csvData?.headers || []}
                                                        filename={`${collectionTitle}.csv`}
                                                        target="_blank"
                                                    />
                                                </>
                                            )}
                                        {(tab === "cards" || tab === "images") && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 gap-1"
                                                        disabled={isRouteLoading.has(location.pathname)}
                                                    >
                                                        <ChevronsUpDown className="h-3.5 w-3.5" />
                                                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                                            Sort
                                                        </span>
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    <ScrollArea className={sortingHeight}>
                                                        <div>
                                                            {sortingFields.map((field: CollectionField) => {
                                                                const fieldCustomization = getFieldCustomization(
                                                                    field,
                                                                    customization,
                                                                )
                                                                const label =
                                                                    tryFunction(fieldCustomization.admin?.label) ||
                                                                    field.name
                                                                const condition =
                                                                    fieldCustomization.admin?.condition?.list
                                                                if (condition !== undefined && !tryFunction(condition))
                                                                    return null
                                                                return (
                                                                    <DropdownMenuItem
                                                                        key={field.name}
                                                                        onClick={() => {
                                                                            if (preventChange) return
                                                                            if (
                                                                                typeof field.sorting === "object" &&
                                                                                field.sorting.direction === "desc"
                                                                            ) {
                                                                                setOrder({
                                                                                    field: field.name,
                                                                                    direction: "desc",
                                                                                })
                                                                            } else {
                                                                                setOrder({
                                                                                    field: field.name,
                                                                                    direction: "asc",
                                                                                })
                                                                            }
                                                                            setState(
                                                                                `collection-sort-${labels.collection.toLowerCase()}`,
                                                                                "sort",
                                                                                JSON.stringify([
                                                                                    {
                                                                                        id: field.name,
                                                                                        desc:
                                                                                            typeof field.sorting ===
                                                                                                "object" &&
                                                                                            field.sorting.direction ===
                                                                                                "desc",
                                                                                    },
                                                                                ]),
                                                                            )
                                                                        }}
                                                                    >
                                                                        {order?.field === field.name && (
                                                                            <Check className="absolute h-3.5 w-3.5 mr-1" />
                                                                        )}
                                                                        <span className="ml-5">{label}</span>
                                                                    </DropdownMenuItem>
                                                                )
                                                            })}
                                                        </div>
                                                    </ScrollArea>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                        {hasFiltersToShow && (
                                            <Sheet>
                                                <SheetTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-7 gap-1 relative"
                                                    >
                                                        <ListFilter className="h-3.5 w-3.5" />
                                                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                                            Filter
                                                        </span>
                                                        {filtersActive && (
                                                            <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 block h-3 w-3 rounded-full bg-destructive"></span>
                                                        )}
                                                    </Button>
                                                </SheetTrigger>
                                                <SheetContent className="overflow-y-auto">
                                                    <SheetHeader>
                                                        <SheetTitle className="mb-4">Filters</SheetTitle>
                                                        <SheetDescription className="hidden">
                                                            Filter records in the list view.
                                                        </SheetDescription>
                                                    </SheetHeader>
                                                    <Filters
                                                        collection={collection}
                                                        excluded={excludedFilters}
                                                        relationList={!!relationList}
                                                    />
                                                </SheetContent>
                                            </Sheet>
                                        )}
                                        {canAddRecords && (
                                            <>
                                                {(() => {
                                                    const relationFieldSchema = relationList
                                                        ? getField(fields, relationList.field)
                                                        : undefined
                                                    const isManyToMany =
                                                        relationFieldSchema && relationFieldSchema.type === "ManyToMany"
                                                    if (relationList && isManyToMany) {
                                                        return (
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button
                                                                        type="button"
                                                                        ref={addButtonRef}
                                                                        size="sm"
                                                                        className="h-7 gap-1"
                                                                        disabled={isCreateDisabled}
                                                                    >
                                                                        <PlusCircle className="h-3.5 w-3.5" />
                                                                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                                                            Add {recordTitle}
                                                                        </span>
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem
                                                                        onClick={() => {
                                                                            ;(async () => {
                                                                                const customization =
                                                                                    getCollectionConfigModule(
                                                                                        labels.collection,
                                                                                    )
                                                                                const override =
                                                                                    customization.admin
                                                                                        ?.addRecordButtonOverride
                                                                                if (
                                                                                    override &&
                                                                                    typeof override === "function"
                                                                                ) {
                                                                                    await tryPromise(() =>
                                                                                        override(
                                                                                            createPrePopulatedRecord(),
                                                                                        ),
                                                                                    )
                                                                                    return
                                                                                }
                                                                                setSelectedDateRange(null)
                                                                                setIsCreateDialogOpen(true)
                                                                            })()
                                                                        }}
                                                                    >
                                                                        Add new
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        onClick={() => {
                                                                            setShowSelectExisting(true)
                                                                            fetchSelectableRecords()
                                                                        }}
                                                                    >
                                                                        Select existing
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        )
                                                    }
                                                    return (
                                                        <Button
                                                            type="button"
                                                            ref={addButtonRef}
                                                            size="sm"
                                                            className="h-7 gap-1"
                                                            disabled={isCreateDisabled}
                                                            onClick={() => {
                                                                ;(async () => {
                                                                    const customization = getCollectionConfigModule(
                                                                        labels.collection,
                                                                    )
                                                                    const override =
                                                                        customization.admin?.addRecordButtonOverride
                                                                    if (override && typeof override === "function") {
                                                                        await tryPromise(() =>
                                                                            override(createPrePopulatedRecord()),
                                                                        )
                                                                        return
                                                                    }
                                                                    setSelectedDateRange(null)
                                                                    setIsCreateDialogOpen(true)
                                                                })()
                                                            }}
                                                        >
                                                            <PlusCircle className="h-3.5 w-3.5" />
                                                            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                                                Add {recordTitle}
                                                            </span>
                                                        </Button>
                                                    )
                                                })()}
                                                {isCreateDialogOpen &&
                                                    createPortal(
                                                        <div
                                                            id="create-record-modal"
                                                            className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-300"
                                                            aria-modal="true"
                                                            aria-live="polite"
                                                            role="dialog"
                                                        >
                                                            <div className="fixed inset-0 bg-black/50" />
                                                            <div
                                                                className="relative bg-background sm:rounded-lg p-6 w-full max-w-2xl h-full sm:h-[90vh] overflow-y-auto border border-border"
                                                                aria-labelledby="dialog-title"
                                                            >
                                                                <div className="space-y-2">
                                                                    <div className="flex justify-between items-center mb-4">
                                                                        <h4
                                                                            id="dialog-title"
                                                                            className="font-medium leading-none"
                                                                        >
                                                                            Add {recordTitle}
                                                                        </h4>
                                                                        <Button
                                                                            type="button"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="right-4 top-4"
                                                                            onClick={() => {
                                                                                setIsCreateDialogOpen(false)
                                                                                setSelectedDateRange(null)
                                                                                setTimeout(() => {
                                                                                    addButtonRef.current?.focus()
                                                                                }, 0)

                                                                                localStorage.removeItem(
                                                                                    `stoker-draft-${labels.collection}`,
                                                                                )
                                                                            }}
                                                                        >
                                                                            <X className="h-4 w-4" />
                                                                            <span className="sr-only">Close</span>
                                                                        </Button>
                                                                    </div>
                                                                    <RecordForm
                                                                        collection={collection}
                                                                        operation="create"
                                                                        path={[labels.collection]}
                                                                        record={createPrePopulatedRecord()}
                                                                        draft={true}
                                                                        onSuccess={() => {
                                                                            setIsCreateDialogOpen(false)
                                                                            setSelectedDateRange(null)
                                                                            setTimeout(() => {
                                                                                addButtonRef.current?.focus()
                                                                            }, 0)
                                                                            if (isServerReadOnly) {
                                                                                setBackToStartKey((prev) => prev + 1)
                                                                            }
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>,
                                                        document.body,
                                                    )}
                                                {showSelectExisting &&
                                                    relationList &&
                                                    relationParent &&
                                                    createPortal(
                                                        <div
                                                            id="select-existing-modal"
                                                            className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-300"
                                                            aria-modal="true"
                                                            aria-live="polite"
                                                            role="dialog"
                                                        >
                                                            <div className="fixed inset-0 bg-black/50" />
                                                            <div className="relative bg-background sm:rounded-lg p-6 w-full max-w-2xl h-full sm:h-[50vh] overflow-y-auto border border-border">
                                                                <div className="flex items-center justify-between mb-4">
                                                                    <h4 className="font-medium leading-none">
                                                                        Select {recordTitle}
                                                                    </h4>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() => {
                                                                            setShowSelectExisting(false)
                                                                            setSelectableSearch("")
                                                                            setSelectableData([])
                                                                        }}
                                                                    >
                                                                        <X className="h-4 w-4" />
                                                                        <span className="sr-only">Close</span>
                                                                    </Button>
                                                                </div>
                                                                <div>
                                                                    <Command filter={() => 1}>
                                                                        <CommandInput
                                                                            placeholder={`Search ${collectionTitle}...`}
                                                                            className="h-9"
                                                                            value={selectableSearch}
                                                                            onValueChange={(value) => {
                                                                                setSelectableSearch(value)
                                                                                fetchSelectableRecords(value)
                                                                            }}
                                                                        />
                                                                        <CommandList className="max-h-full sm:max-h-[calc(50vh-138px)]">
                                                                            <CommandEmpty>
                                                                                {selectLoading ? (
                                                                                    <LoadingSpinner
                                                                                        size={7}
                                                                                        className="m-auto"
                                                                                    />
                                                                                ) : !selectLoadingImmediate ? (
                                                                                    `No ${collectionTitle} found.`
                                                                                ) : null}
                                                                            </CommandEmpty>
                                                                            {(!selectLoading ||
                                                                                isPreloadCacheEnabled) && (
                                                                                <CommandGroup>
                                                                                    {selectableData.map((record) => (
                                                                                        <CommandItem
                                                                                            key={record.id}
                                                                                            value={record.id}
                                                                                            onSelect={() => {
                                                                                                linkExistingRecord(
                                                                                                    record,
                                                                                                )
                                                                                            }}
                                                                                        >
                                                                                            {
                                                                                                record[
                                                                                                    recordTitleField ||
                                                                                                        "id"
                                                                                                ]
                                                                                            }
                                                                                        </CommandItem>
                                                                                    ))}
                                                                                </CommandGroup>
                                                                            )}
                                                                        </CommandList>
                                                                    </Command>
                                                                </div>
                                                            </div>
                                                        </div>,
                                                        document.body,
                                                    )}
                                            </>
                                        )}
                                    </div>
                                </div>
                                {tab && isInitialized ? (
                                    <>
                                        <TabsContent
                                            value="list"
                                            className={cn(
                                                relationList
                                                    ? formList
                                                        ? "max-w-[calc(100vw-98px)] lg:max-w-[calc(100vw-288px)]"
                                                        : "max-w-[calc(100vw-64px)] lg:max-w-[calc(100vw-288px)]"
                                                    : "max-w-[calc(100vw-32px)] lg:max-w-[calc(100vw-48px)]",
                                            )}
                                        >
                                            <List
                                                key={`${labels.collection}-list`}
                                                collection={collection}
                                                list={list.default}
                                                setList={setList}
                                                setServerList={setServerList}
                                                setTable={setTable}
                                                cursor={cursor.default}
                                                setCursor={setCursor}
                                                prevCursor={prevCursor.default}
                                                pages={pages.default}
                                                getData={getData}
                                                unsubscribe={unsubscribe}
                                                backToStartKey={backToStartKey}
                                                setBackToStartKey={setBackToStartKey}
                                                search={search}
                                                defaultSort={defaultSort}
                                                setOptimisticList={setOptimisticList}
                                                relationList={!!relationList}
                                                relationCollection={relationCollection}
                                                relationParent={relationParent}
                                                formList={formList}
                                                itemsPerPage={itemsPerPage}
                                            />
                                        </TabsContent>
                                        <TabsContent value="cards">
                                            <Cards
                                                key={`${labels.collection}-cards`}
                                                collection={collection}
                                                list={list}
                                                setList={setList}
                                                setServerList={setServerList}
                                                cursor={cursor}
                                                setCursor={setCursor}
                                                count={count}
                                                getData={getData}
                                                unsubscribe={unsubscribe}
                                                statusFilter={statusFilter}
                                                setStatusFilter={onStatusFilterChange}
                                                firstTabLoadCards={firstTabLoadCards}
                                                backToStartKey={backToStartKey}
                                                setOptimisticList={setOptimisticList}
                                                autoUpdateStatusFilter={autoUpdateStatusFilter}
                                                search={search}
                                                relationList={!!relationList}
                                                formList={!!formList}
                                            />
                                        </TabsContent>
                                        <TabsContent value="images">
                                            <Images
                                                key={`${labels.collection}-images`}
                                                collection={collection}
                                                list={list}
                                                setList={setList}
                                                setServerList={setServerList}
                                                cursor={cursor.default}
                                                setCursor={setCursor}
                                                count={count.default}
                                                getData={getData}
                                                unsubscribe={unsubscribe}
                                                search={search}
                                                backToStartKey={backToStartKey}
                                                relationList={!!relationList}
                                                formList={!!formList}
                                            />
                                        </TabsContent>
                                        <TabsContent value="map">
                                            <StokerMap
                                                key={`${labels.collection}-map`}
                                                collection={collection}
                                                list={list.default}
                                                setList={setList}
                                                setServerList={setServerList}
                                                getData={getData}
                                                unsubscribe={unsubscribe}
                                                backToStartKey={backToStartKey}
                                                setOptimisticList={setOptimisticList}
                                                relationList={!!relationList}
                                                formList={!!formList}
                                            />
                                        </TabsContent>
                                        <TabsContent value="calendar">
                                            {(!isPreloadCacheEnabled || !preloadCache?.range || currentField) && (
                                                <Calendar
                                                    key={`${labels.collection}-calendar`}
                                                    collection={collection}
                                                    list={list.default}
                                                    setList={setList}
                                                    setServerList={setServerList}
                                                    getData={getData}
                                                    unsubscribe={unsubscribe}
                                                    setOptimisticList={setOptimisticList}
                                                    canAddRecords={!!(canAddRecords && !isCreateDisabled)}
                                                    onDateSelection={handleCalendarDateSelection}
                                                    backToStartKey={backToStartKey}
                                                    relationList={!!relationList}
                                                    formList={!!formList}
                                                />
                                            )}
                                        </TabsContent>
                                    </>
                                ) : (
                                    !relationList &&
                                    (tab === "list" ? (
                                        <div className="py-2">
                                            <Card className="h-[calc(100vh-250px)]"></Card>
                                        </div>
                                    ) : tab === "map" ? (
                                        <div className="py-2">
                                            <Card className="h-[calc(100vh-204px)]"></Card>
                                        </div>
                                    ) : (
                                        tab === "calendar" && (
                                            <div className="py-2">
                                                <Card className="h-[calc(100vh-186px)]"></Card>
                                            </div>
                                        )
                                    ))
                                )}
                            </Tabs>
                        </main>
                    )}
                </div>
            </>
        )
    )
}

export default Collection

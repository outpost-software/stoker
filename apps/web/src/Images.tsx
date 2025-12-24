import {
    CollectionMeta,
    CollectionSchema,
    ImagesConfig,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import { getCachedConfigValue } from "@stoker-platform/utils"
import {
    Cursor,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    onStokerPermissionsChange,
    subscribeOne,
} from "@stoker-platform/web-client"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { useGoToRecord } from "./utils/goToRecord"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { cn } from "./lib/utils"
import { Image } from "lucide-react"
import { FixedSizeList as List } from "react-window"
import InfiniteLoader from "react-window-infinite-loader"
import { serverReadOnly } from "./utils/serverReadOnly"
import { Query } from "./Collection"
import { useFilters } from "./providers/FiltersProvider"
import { getOrderBy } from "./utils/getOrderBy"
import { sortList } from "./utils/sortList"
import { FirestoreError, QueryConstraint, Timestamp, where } from "firebase/firestore"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import cloneDeep from "lodash/cloneDeep.js"
import isEqual from "lodash/isEqual.js"
import { localFullTextSearch } from "./utils/localFullTextSearch"
import { Helmet } from "react-helmet"
import { useConnection } from "./providers/ConnectionProvider"
import { getSafeUrl } from "./utils/isSafeUrl"

export const description = "A list of records as cards. The content area has a search bar in the header."

interface RowImageProps {
    src: string
    alt: string
}

const RowImage = memo(
    ({ src, alt }: RowImageProps) => {
        const [isLoaded, setIsLoaded] = useState(false)
        const [showSpinner, setShowSpinner] = useState(false)

        useEffect(() => {
            setIsLoaded(false)
            setShowSpinner(false)
            const timer = setTimeout(() => {
                if (!isLoaded) setShowSpinner(true)
            }, 500)
            return () => clearTimeout(timer)
        }, [src])

        useEffect(() => {
            if (isLoaded) setShowSpinner(false)
        }, [isLoaded])
        return (
            <>
                <img
                    alt={alt}
                    className={cn(
                        "max-w-full max-h-full object-contain rounded-md ease-in-out duration-300 transition-opacity-transform hover:scale-95",
                        { "opacity-0": !isLoaded, "opacity-100": isLoaded },
                    )}
                    src={getSafeUrl(src)}
                    onLoad={() => setIsLoaded(true)}
                />
                {!isLoaded && showSpinner && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <LoadingSpinner size={7} />
                    </div>
                )}
            </>
        )
    },
    (prevProps, nextProps) => prevProps.src === nextProps.src && prevProps.alt === nextProps.alt,
)
RowImage.displayName = "RowImage"

interface RowData {
    collection: CollectionSchema
    groupedRecords: StokerRecord[][]
    size: string | undefined
    cols: string | undefined
    lineClamp: string
    recordTitleField: string | undefined
    imagesConfig: ImagesConfig
}

interface RowProps {
    index: number
    style: React.CSSProperties
    data: RowData
}

const Row = ({ index, style, data }: RowProps) => {
    const goToRecord = useGoToRecord()
    const { collection, groupedRecords, size, cols, lineClamp, recordTitleField, imagesConfig } = data
    // eslint-disable-next-line security/detect-object-injection
    const group = groupedRecords[index]
    return (
        <div style={style} className={cn("grid", "gap-4", "pb-4", cols)}>
            {group.map((record) => {
                // eslint-disable-next-line security/detect-object-injection
                const title = recordTitleField ? record[recordTitleField] : record.id
                return (
                    <Card key={record.id}>
                        <CardHeader
                            onClick={() => goToRecord(collection, record)}
                            className="cursor-pointer py-3 md:py-4"
                        >
                            <button className="mx-auto block w-full break-words">
                                <CardTitle className={cn(lineClamp, "hover:underline", "leading-normal")}>
                                    {title}
                                </CardTitle>
                            </button>
                        </CardHeader>
                        <CardContent className="pb-3 md:pb-4">
                            <div className={cn("grid", "gap-2", size)}>
                                <button
                                    className="relative w-full h-full flex items-center justify-center overflow-hidden"
                                    onClick={() => goToRecord(collection, record)}
                                >
                                    {record[imagesConfig.imageField] ? (
                                        <RowImage alt={title} src={record[imagesConfig.imageField]} />
                                    ) : (
                                        <Image size={100} className="text-muted-foreground stroke-1 opacity-50" />
                                    )}
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}

const renderRow = ({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) => (
    <Row index={index} style={style} data={data} />
)

interface ImagesProps {
    collection: CollectionSchema
    list: { [key: string | number]: StokerRecord[] | undefined }
    setList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    setServerList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    cursor: Cursor | undefined
    setCursor: React.Dispatch<React.SetStateAction<{ [key: string | number]: Cursor | undefined }>>
    count: number | undefined
    getData: (query: Query, key?: string | number) => Promise<void>
    unsubscribe: React.MutableRefObject<{ [key: string | number]: (() => void)[] }>
    search: string | undefined
    backToStartKey: number
    relationList?: boolean
    formList?: boolean
}

export const Images = memo(
    ({
        collection,
        list,
        cursor,
        setCursor,
        getData,
        unsubscribe,
        setList,
        setServerList,
        search,
        backToStartKey,
        relationList,
        formList,
    }: ImagesProps) => {
        const { labels, recordTitleField, fullTextSearch } = collection
        const customization = getCollectionConfigModule(labels.collection)
        const permissions = getCurrentUserPermissions()
        const [connectionStatus] = useConnection()

        const [imagesConfig, setImagesConfig] = useState<ImagesConfig | undefined>(undefined)
        const [collectionTitle, setCollectionTitle] = useState<string | undefined>(undefined)
        const [meta, setMeta] = useState<CollectionMeta | undefined>(undefined)

        const [itemsPerPage, setItemsPerPage] = useState<number | undefined>(undefined)
        const [query, setQuery] = useState<Query | undefined>(undefined)
        const [isLoading, setIsLoading] = useState(false)
        const [ready, setReady] = useState(false)
        const [isInitialized, setIsInitialized] = useState(false)

        const isServerReadOnly = serverReadOnly(collection)
        const isPreloadCacheEnabled = preloadCacheEnabled(collection)

        const { filters, order, getFilterConstraints, filterRecord } = useFilters()
        const constraints = useMemo(() => getFilterConstraints(), [filters, search])
        const [prevOrder, setPrevOrder] = useState<{ id: string; desc: boolean }[] | undefined>(undefined)
        const [orderByField, setOrderByField] = useState<string | undefined>(undefined)
        const [orderByDirection, setOrderByDirection] = useState<"asc" | "desc" | undefined>(undefined)

        const backToStart = useCallback(
            (
                latestConstraints?: QueryConstraint[],
                latestOrderByField?: string,
                latestOrderByDirection?: "asc" | "desc",
            ) => {
                return new Promise<void>((resolve) => {
                    setServerList({})
                    setList({})
                    const newQuery = {
                        infinite: !isPreloadCacheEnabled && !isServerReadOnly,
                        queries: [
                            {
                                constraints: latestConstraints || constraints,
                                options:
                                    !isPreloadCacheEnabled && !isServerReadOnly
                                        ? {
                                              pagination: {
                                                  number: itemsPerPage || 10,
                                                  orderByField: latestOrderByField || orderByField,
                                                  orderByDirection: latestOrderByDirection || orderByDirection,
                                              },
                                          }
                                        : {},
                            },
                        ],
                    }
                    getData(newQuery).then(() => {
                        resolve()
                    })
                    setQuery(newQuery)

                    if (!isPreloadCacheEnabled && !isServerReadOnly) {
                        const latestQuery = {
                            infinite: false,
                            queries: [
                                {
                                    constraints: [where("Last_Save_At", ">", Timestamp.now())],
                                    options: {},
                                },
                            ],
                        }
                        getData(latestQuery, "latest")
                    }
                })
            },
            [
                isPreloadCacheEnabled,
                isServerReadOnly,
                constraints,
                itemsPerPage,
                orderByField,
                orderByDirection,
                search,
            ],
        )

        useEffect(() => {
            if (!isInitialized) return
            backToStart()
        }, [backToStartKey])

        const backToStartRef = useRef(backToStart)
        useEffect(() => {
            backToStartRef.current = backToStart
        }, [backToStart])

        useEffect(() => {
            let unsubscribePermissions: (() => void) | undefined
            if (ready) {
                // Prevent race condition when transitioning from cards to images view and auto-updating status filter
                const constraints = getFilterConstraints()
                const { orderByField, orderByDirection } = getOrderBy(collection, order)

                backToStart(constraints as QueryConstraint[], orderByField, orderByDirection).then(() => {
                    setIsInitialized(true)
                })

                unsubscribePermissions = onStokerPermissionsChange(() => {
                    const latestPermissions = getCurrentUserPermissions()
                    if (
                        !isEqual(
                            latestPermissions?.collections?.[labels.collection],
                            originalPermissions.current?.collections?.[labels.collection],
                        )
                    ) {
                        const constraints = getFilterConstraints()
                        backToStartRef.current(constraints as QueryConstraint[])
                        originalPermissions.current = cloneDeep(latestPermissions)
                    }
                })
            }
            return unsubscribePermissions
        }, [ready])

        useEffect(() => {
            if (!isInitialized) return
            backToStart()
        }, [filters])

        useEffect(() => {
            if (!isPreloadCacheEnabled && !isServerReadOnly) {
                const { orderByField, orderByDirection } = getOrderBy(collection, order)
                setOrderByField(orderByField)
                setOrderByDirection(orderByDirection)
            }
        }, [list])

        useEffect(() => {
            const { orderByField, orderByDirection } = getOrderBy(collection, order)
            setOrderByField(orderByField)
            setOrderByDirection(orderByDirection)
            if (isInitialized) {
                if (
                    order &&
                    (!prevOrder ||
                        prevOrder.length === 0 ||
                        prevOrder[0].id !== order.field ||
                        (prevOrder[0].desc && order.direction === "asc") ||
                        (!prevOrder[0].desc && order.direction === "desc"))
                ) {
                    setPrevOrder([{ id: order.field, desc: order.direction === "desc" }])
                    if (!isPreloadCacheEnabled && !isServerReadOnly) {
                        backToStart(undefined, orderByField, orderByDirection)
                    }
                }
            }
        }, [order])

        useEffect(() => {
            const timer = setTimeout(() => {
                if (isInitialized && fullTextSearch && !isPreloadCacheEnabled && !isServerReadOnly) {
                    backToStart()
                }
            }, 750)
            return () => clearTimeout(timer)
        }, [search])

        const originalPermissions = useRef<StokerPermissions | null>(cloneDeep(permissions))

        useEffect(() => {
            const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                "collections",
                labels.collection,
                "admin",
            ]
            const initialize = async () => {
                const itemsPerPage = await getCachedConfigValue(customization, [...collectionAdminPath, "itemsPerPage"])
                setItemsPerPage(itemsPerPage)
                const imagesConfig = await getCachedConfigValue(customization, [...collectionAdminPath, "images"])
                setImagesConfig(imagesConfig)
                const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
                setCollectionTitle(titles?.collection)
                const meta = await getCachedConfigValue(customization, [...collectionAdminPath, "meta"])
                setMeta(meta)
                setCursor({})
                setList({})
                setServerList({})
                if (unsubscribe.current) {
                    Object.values(unsubscribe.current).forEach((unsubscribe) =>
                        unsubscribe.forEach((unsubscribe) => unsubscribe()),
                    )
                }

                setReady(true)
            }
            initialize()
        }, [])

        const [height, setHeight] = useState(window.innerHeight - 188)
        const [columns, setColumns] = useState<number | undefined>(undefined)
        const [itemSize, setItemSize] = useState<number | undefined>(undefined)
        const [size, setSize] = useState<string | undefined>(undefined)
        const [cols, setCols] = useState<string | undefined>(undefined)

        const getSize = useCallback((size: string) => {
            const sizes = size.match(/h-\[(\d+)px\]/g)
            if (!sizes) return 0
            const sizeMap: { [key: string]: number } = {
                sm: parseInt(sizes[0].replace(/[^\d]/g, "")),
                md: parseInt(sizes[1].replace(/[^\d]/g, "")),
                lg: parseInt(sizes[2].replace(/[^\d]/g, "")),
                xl: parseInt(sizes[3].replace(/[^\d]/g, "")),
            }
            if (window.innerWidth >= 1280) return sizeMap.xl
            if (window.innerWidth >= 1024) return sizeMap.lg
            if (window.innerWidth >= 768) return sizeMap.md
            return sizeMap.sm
        }, [])

        const getColumns = useCallback((cols: string) => {
            const colClasses = cols.match(/grid-cols-(\d+)/g)
            if (!colClasses) return 0
            const colMap: { [key: string]: number } = {
                default: parseInt(colClasses[0].replace(/[^\d]/g, "")),
                sm: parseInt(colClasses[1].replace(/[^\d]/g, "")),
                md: parseInt(colClasses[2].replace(/[^\d]/g, "")),
                lg: parseInt(colClasses[3].replace(/[^\d]/g, "")),
                xl: parseInt(colClasses[4].replace(/[^\d]/g, "")),
            }
            if (window.innerWidth >= 1280) return colMap.xl
            if (window.innerWidth >= 1024) return colMap.lg
            if (window.innerWidth >= 768) return colMap.md
            if (window.innerWidth >= 640) return colMap.sm
            return colMap.default
        }, [])

        useEffect(() => {
            const handleResize = () => {
                const sizeMap = {
                    sm: {
                        size: "h-[100px] md:h-[75px] lg:h-[110px] xl:h-[125px]",
                        cols: "grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7",
                    },
                    md: {
                        size: "h-[275px] md:h-[125px] lg:h-[150px] xl:h-[175px]",
                        cols: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
                    },
                    lg: {
                        size: "h-[275px] md:h-[300px] lg:h-[400px] xl:h-[450px]",
                        cols: "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2",
                    },
                    default: {
                        size: "h-[275px] md:h-[125px] lg:h-[150px] xl:h-[175px]",
                        cols: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
                    },
                }

                const config = sizeMap[imagesConfig?.size || "default"]
                setSize(config.size)
                setCols(config.cols)
                setItemSize(getSize(config.size))
                setColumns(getColumns(config.cols))

                if (window.innerWidth >= 1280) {
                    setHeight(window.innerHeight - 188)
                } else if (columns && itemSize) {
                    setHeight(window.innerHeight)
                }
            }
            handleResize()

            window.addEventListener("resize", handleResize)
            return () => {
                window.removeEventListener("resize", handleResize)
            }
        }, [list, imagesConfig?.size])

        const [removedList, setRemovedList] = useState<StokerRecord[]>([])

        const defaultList = list.default
        const latestList = list.latest

        const groupedRecords = useMemo(() => {
            if (!list) return []
            if (typeof orderByField !== "string") return []
            const removeEmptyRecords: StokerRecord[] = []
            const latestFiltered = latestList?.filter((record) => filterRecord(record)) || []
            defaultList
                ?.concat(latestFiltered)
                .concat(removedList)
                .forEach((record) => {
                    if (record !== undefined) {
                        removeEmptyRecords.push(record)
                    }
                })
            const dedupedRecords = Array.from(new Map(removeEmptyRecords.map((record) => [record.id, record])).values())
            const groups: StokerRecord[][] = []
            let sortedList = sortList(collection, dedupedRecords, orderByField, orderByDirection)
            if (search && (isPreloadCacheEnabled || isServerReadOnly)) {
                const searchResults = localFullTextSearch(collection, search, sortedList).map((result) => result.id)
                sortedList = sortedList.filter((record) => searchResults.includes(record.id))
            }
            if (!columns) return []
            for (let i = 0; i < sortedList.length; i += columns) {
                groups.push(sortedList.slice(i, i + columns))
            }
            return groups
        }, [list, removedList, columns, orderByField, orderByDirection, search])

        const [isFirstLoad, setIsFirstLoad] = useState(true)
        const [prevIds, setPrevIds] = useState<Set<string>>(new Set())

        useEffect(() => {
            setIsFirstLoad(true)
        }, [filters, orderByField, orderByDirection])

        useEffect(() => {
            if (list && !isFirstLoad && !isPreloadCacheEnabled && !isServerReadOnly) {
                const removeEmptyRecords: StokerRecord[] = []
                defaultList?.forEach((record) => {
                    if (record !== undefined) {
                        removeEmptyRecords.push(record)
                    }
                })
                const newIds = new Set(removeEmptyRecords?.map((record) => record.id))
                const removedIds = Array.from(prevIds.difference(newIds))
                removedIds.forEach((id) => {
                    let unsubscribeOne: () => void
                    // TODO: subcollection support
                    subscribeOne([labels.collection], id, (record) => {
                        if (
                            record &&
                            filterRecord(record) &&
                            (!search || localFullTextSearch(collection, search, [record]).length > 0)
                        ) {
                            setRemovedList((prev) => [...prev, record])
                        } else if (unsubscribeOne) {
                            setRemovedList((prev) => prev.filter((record) => record.id !== id))
                            unsubscribeOne()
                        }
                    })
                        .then((result) => {
                            unsubscribeOne = result
                            unsubscribe.current.default.push(unsubscribeOne)
                        })
                        .catch(() => {})
                })
                setPrevIds(newIds)
            }
            if (list) {
                setIsFirstLoad(false)
            }
        }, [list])

        useEffect(() => {
            if (isFirstLoad) {
                setRemovedList([])
            }
        }, [isFirstLoad])

        const itemCount = columns ? groupedRecords.length : 0
        // eslint-disable-next-line security/detect-object-injection
        const itemKey = (index: number) => groupedRecords[index].map((record) => record.id).join("-")

        const loadMoreItems = useCallback(() => {
            if (isLoading) return
            return new Promise<void>((resolve) => {
                if (cursor?.last.get(0) === undefined) {
                    resolve()
                    return
                }
                setIsLoading(true)
                const newQuery = {
                    infinite: true,
                    queries: [
                        ...(query?.queries || []),
                        {
                            constraints,
                            options: {
                                pagination: {
                                    startAfter: cursor,
                                    number: itemsPerPage || 10,
                                    orderByField,
                                    orderByDirection,
                                },
                            },
                        },
                    ],
                }
                getData(newQuery)
                    .then(() => {
                        setQuery(newQuery)
                        resolve()
                    })
                    .catch((error) => {
                        if (error instanceof FirestoreError && error.code === "not-found") {
                            backToStart()
                            resolve()
                        }
                    })
                    .finally(() => {
                        setIsLoading(false)
                    })
            })
        }, [cursor, itemsPerPage, isLoading, query, constraints, orderByField, orderByDirection])

        if (!imagesConfig || !itemSize || !columns || !recordTitleField) return null

        const lineClamp = imagesConfig.maxHeaderLines === 2 ? "line-clamp-2" : "line-clamp-1"
        const headerSize = imagesConfig.maxHeaderLines === 2 ? 116 : 82

        const itemData = {
            collection,
            groupedRecords,
            size,
            cols,
            lineClamp,
            recordTitleField,
            imagesConfig,
        }

        const Meta = () => (
            <Helmet>
                <title>{`${meta?.title || collectionTitle || labels.collection} - Photos`}</title>
                {meta?.description && <meta name="description" content={meta.description} />}
            </Helmet>
        )

        if (connectionStatus === "offline") {
            return (
                <div className="flex justify-center items-center h-[calc(100vh-300px)]">
                    <Card className="w-full lg:w-auto lg:min-w-[750px] text-center">
                        <CardHeader>
                            <CardTitle>You are offline.</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {`${imagesConfig.title || "Images"} are not available in offline mode`}.
                        </CardContent>
                    </Card>
                </div>
            )
        }

        if (isPreloadCacheEnabled || isServerReadOnly) {
            return (
                <div className={cn(relationList ? "xl:h-[calc(100vh-304px)] overflow-y-scroll" : "")}>
                    {!formList && <Meta />}
                    <List
                        height={height}
                        width="100%"
                        itemSize={itemSize + headerSize}
                        itemCount={itemCount}
                        overscanCount={5}
                        itemKey={itemKey}
                        itemData={itemData}
                    >
                        {renderRow}
                    </List>
                </div>
            )
        } else {
            return (
                <div className={cn(relationList ? "xl:h-[calc(100vh-304px)] overflow-y-scroll" : "")}>
                    {!formList && <Meta />}
                    <InfiniteLoader
                        isItemLoaded={(index) => index < itemCount}
                        itemCount={100000}
                        loadMoreItems={loadMoreItems}
                        minimumBatchSize={Math.ceil((itemsPerPage || 10) / columns)}
                        threshold={Math.ceil((itemsPerPage || 40) / columns)}
                    >
                        {({ onItemsRendered, ref }) => (
                            <List
                                height={height}
                                width="100%"
                                itemSize={itemSize + headerSize}
                                itemCount={itemCount}
                                overscanCount={5}
                                itemKey={itemKey}
                                ref={ref}
                                onItemsRendered={onItemsRendered}
                                itemData={itemData}
                            >
                                {renderRow}
                            </List>
                        )}
                    </InfiniteLoader>
                </div>
            )
        }
    },
    (prevProps, nextProps) => prevProps.list === nextProps.list && prevProps.search === nextProps.search,
)
Images.displayName = "Images"

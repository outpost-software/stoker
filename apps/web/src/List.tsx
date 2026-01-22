import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
    Chart,
    CollectionMeta,
    CollectionSchema,
    FormList,
    Metric,
    RowHighlight,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
    collectionAccess,
    getCachedConfigValue,
    getField,
    getFieldCustomization,
    isRelationField,
    isSortingEnabled,
    tryFunction,
} from "@stoker-platform/utils"
import {
    Cursor,
    deleteRecord,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getCurrentUserRoleGroups,
    getDocumentRefs,
    getTimezone,
    onStokerPermissionsChange,
} from "@stoker-platform/web-client"
import { cn } from "./lib/utils"
import {
    Cell,
    ColumnDef,
    ColumnFiltersState,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    Row,
    SortingState,
    Table as TableType,
    useReactTable,
} from "@tanstack/react-table"
import { Button } from "./components/ui/button"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChevronsUpDown, X } from "lucide-react"
import { Checkbox } from "./components/ui/checkbox"
import { isOfflineDisabled } from "./utils/isOfflineDisabled"
import { useGlobalLoading, useRouteLoading } from "./providers/LoadingProvider"
import { getDoc, Timestamp } from "firebase/firestore"
import { useToast } from "./hooks/use-toast"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "./components/ui/alert-dialog"
import cloneDeep from "lodash/cloneDeep.js"
import isEqual from "lodash/isEqual.js"
import { getFormattedFieldValue } from "./utils/getFormattedFieldValue"
import { useGoToRecord } from "./utils/goToRecord"
import { ScrollArea, ScrollBar } from "./components/ui/scroll-area"
import { isServerDelete } from "./utils/isServerWrite"
import { Badge } from "./components/ui/badge"
import { serverReadOnly } from "./utils/serverReadOnly"
import { Query } from "./Collection"
import { useStokerState } from "./providers/StateProvider"
import { useFilters } from "./providers/FiltersProvider"
import { getOrderBy } from "./utils/getOrderBy"
import { useLocation } from "react-router"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { localFullTextSearch } from "./utils/localFullTextSearch"
import {
    ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from "./components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { DateTime } from "luxon"
import { Helmet } from "react-helmet"
import { useConnection } from "./providers/ConnectionProvider"
import { useOptimistic } from "./providers/OptimisticProvider"
import { createPortal } from "react-dom"
import { RecordForm } from "./Form"
import { getSortingValue } from "./utils/getSortingValue"

export const description = "A list of records in a table. The content area has a search bar in the header."

interface ListProps {
    collection: CollectionSchema
    list: StokerRecord[] | undefined
    setList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    setServerList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    setTable: React.Dispatch<React.SetStateAction<TableType<StokerRecord> | undefined>>
    cursor: Cursor | undefined
    setCursor: React.Dispatch<React.SetStateAction<{ [key: string | number]: Cursor | undefined }>>
    prevCursor: Cursor | undefined
    pages: number | undefined
    getData: (query: Query, direction?: "next" | "prev") => Promise<void>
    unsubscribe: React.MutableRefObject<{ [key: string | number]: ((direction?: "first" | "last") => void)[] }>
    backToStartKey: number
    setBackToStartKey: React.Dispatch<React.SetStateAction<number>>
    search: string | undefined
    defaultSort:
        | {
              field: string
              direction?: "asc" | "desc"
          }
        | undefined
    setOptimisticList: () => void
    relationList?: boolean
    relationCollection?: CollectionSchema
    relationParent?: StokerRecord
    formList?: FormList
    itemsPerPage?: number
}

export function List({
    collection,
    list,
    setList,
    setServerList,
    setTable,
    cursor,
    setCursor,
    prevCursor,
    pages,
    getData,
    unsubscribe,
    backToStartKey,
    setBackToStartKey,
    search,
    defaultSort,
    setOptimisticList,
    relationList,
    relationCollection,
    relationParent,
    formList,
    itemsPerPage: itemsPerPageOverride,
}: ListProps) {
    const { labels, fields, access, recordTitleField, softDelete, fullTextSearch } = collection
    const { serverWriteOnly } = access
    const softDeleteField = softDelete?.archivedField
    const softDeleteTimestampField = softDelete?.timestampField
    const roleGroups = getCurrentUserRoleGroups()
    const roleGroup = roleGroups[labels.collection]
    const customization = getCollectionConfigModule(labels.collection)
    const timezone = getTimezone()
    const permissions = getCurrentUserPermissions()
    if (!permissions) throw new Error("PERMISSION_DENIED")
    const collectionPermissions = permissions?.collections?.[labels.collection]
    const goToRecord = useGoToRecord()
    const { toast } = useToast()
    const location = useLocation()
    const [connectionStatus] = useConnection()

    const [state, setStokerState] = useStokerState()
    const setState = useCallback(
        (key: string, param: string, value: string | number | SortingState) => {
            if (!relationList) {
                setStokerState(key, param, value)
            }
        },
        [relationList],
    )

    const { filters, order, setOrder, getFilterConstraints } = useFilters()
    const constraints = useMemo(() => getFilterConstraints(), [filters, search])
    const { orderByField, orderByDirection } = useMemo(() => getOrderBy(collection, order), [order])

    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingDebounced, setIsLoadingDebounced] = useState(false)
    const { isGlobalLoading, setGlobalLoading } = useGlobalLoading()
    const { setIsRouteLoading } = useRouteLoading()
    const [isInitialized, setIsInitialized] = useState(false)

    const [sorting, setSorting] = useState<SortingState>([])
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [rowSelection, setRowSelection] = useState({})
    const [metrics, setMetrics] = useState<Metric[] | undefined>(undefined)
    const [collectionTitle, setCollectionTitle] = useState<string | undefined>(undefined)
    const [meta, setMeta] = useState<CollectionMeta | undefined>(undefined)
    const [rowHighlight, setRowHighlight] = useState<RowHighlight[] | undefined>(undefined)
    const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false)

    const [itemsPerPage, setItemsPerPage] = useState<number | undefined>(itemsPerPageOverride)
    const pageSize = itemsPerPage || 10
    const [pageIndex, setPageIndex] = useState(0)
    const [pageNumber, setPageNumber] = useState(1)
    const [pageCount, setPageCount] = useState<number | undefined>(undefined)
    const [pagesLoaded, setPagesLoaded] = useState(false)
    const isServerReadOnly = serverReadOnly(collection)
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)
    const [disableOfflineDelete, setDisableOfflineDelete] = useState<boolean | undefined>(undefined)

    const { setOptimisticDelete, removeOptimisticDelete } = useOptimistic()

    const originalPermissions = useRef<StokerPermissions | null>(cloneDeep(permissions))

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoadingDebounced(isLoading)
        }, 500)
        return () => clearTimeout(timer)
    }, [isLoading])

    const initialize = useCallback(async () => {
        const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
            "collections",
            labels.collection,
            "admin",
        ]
        if (!itemsPerPageOverride) {
            const itemsPerPage = await getCachedConfigValue(customization, [...collectionAdminPath, "itemsPerPage"])
            setItemsPerPage(itemsPerPage)
        }
        const metrics = await getCachedConfigValue(customization, [...collectionAdminPath, "metrics"])
        setMetrics(metrics)
        const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
        setCollectionTitle(titles?.collection)
        const meta = await getCachedConfigValue(customization, [...collectionAdminPath, "meta"])
        setMeta(meta)
        const rowHighlight = await getCachedConfigValue(customization, [...collectionAdminPath, "rowHighlight"])
        setRowHighlight(rowHighlight)
        const disableOfflineDelete = await getCachedConfigValue(customization, [
            ...collectionAdminPath,
            "disableOfflineDelete",
        ])
        setDisableOfflineDelete(disableOfflineDelete)

        setCursor({})
        setList({})
        setServerList({})
        if (unsubscribe.current) {
            Object.values(unsubscribe.current).forEach((unsubscribe) =>
                unsubscribe.forEach((unsubscribe) => unsubscribe()),
            )
        }

        // Prevent race condition when transitioning from cards to list view and auto-updating status filter
        const constraints = getFilterConstraints()

        if (!isPreloadCacheEnabled && !isServerReadOnly) {
            setIsRouteLoading("+", location.pathname)
            const number = itemsPerPage || 10
            const pageNumberState = state[`collection-page-number-${labels.collection.toLowerCase()}`]
            const pageNumber = parseInt(pageNumberState)
            const startAfterState = state[`collection-start-after-${labels.collection.toLowerCase()}`]
            const endBeforeState = state[`collection-end-before-${labels.collection.toLowerCase()}`]
            let startAfter: Cursor | undefined, endBefore: Cursor | undefined
            if (!relationList && pageNumber) {
                if (pageNumber !== 1 && !startAfterState && !endBeforeState) {
                    setPageNumber(1)
                    setState(`collection-page-number-${labels.collection.toLowerCase()}`, "page", 1)
                } else {
                    setPageNumber(pageNumber)
                    setState(`collection-page-number-${labels.collection.toLowerCase()}`, "page", pageNumber)
                    if (pageNumber !== 1) {
                        if (startAfterState) {
                            const refs = getDocumentRefs([labels.collection], startAfterState, roleGroup)
                            const cursor = { first: new Map(), last: new Map() }
                            const docs = await Promise.all(refs.map((ref) => getDoc(ref)))
                            docs.forEach((doc, index) => {
                                cursor.last.set(index, doc)
                            })
                            startAfter = cursor
                            setState(
                                `collection-start-after-${labels.collection.toLowerCase()}`,
                                "start",
                                startAfterState,
                            )
                        }
                        if (endBeforeState) {
                            const refs = getDocumentRefs([labels.collection], endBeforeState, roleGroup)
                            const cursor = { first: new Map(), last: new Map() }
                            const docs = await Promise.all(refs.map((ref) => getDoc(ref)))
                            docs.forEach((doc, index) => {
                                cursor.first.set(index, doc)
                            })
                            endBefore = cursor
                            setState(`collection-end-before-${labels.collection.toLowerCase()}`, "end", endBeforeState)
                        }
                    } else {
                        setState(`collection-start-after-${labels.collection.toLowerCase()}`, "start", "DELETE_STATE")
                        setState(`collection-end-before-${labels.collection.toLowerCase()}`, "end", "DELETE_STATE")
                    }
                }
            }

            setIsLoading(true)
            getData({
                infinite: false,
                queries: [
                    {
                        constraints,
                        options: {
                            pagination: {
                                number,
                                orderByField,
                                orderByDirection,
                                startAfter: startAfter,
                                endBefore: endBefore,
                            },
                        },
                    },
                ],
            })
                .then(() => {
                    setIsLoading(false)
                    setIsInitialized(true)
                })
                .catch((error) => {
                    if (error.code === "not-found") {
                        backToStart(itemsPerPage)?.then(() => {
                            setIsInitialized(true)
                        })
                    } else {
                        throw error
                    }
                })
        } else {
            getData({
                infinite: false,
                queries: [
                    {
                        constraints,
                        options: {},
                    },
                ],
            }).then(() => {
                setIsInitialized(true)
            })
        }
    }, [isPreloadCacheEnabled, isServerReadOnly, location.pathname, orderByField, orderByDirection, state, unsubscribe])

    const initializeRef = useRef(initialize)

    useEffect(() => {
        initializeRef.current = initialize
    }, [initialize])

    useEffect(() => {
        initialize()

        const unsubscribePermissions = onStokerPermissionsChange(() => {
            const latestPermissions = getCurrentUserPermissions()
            if (
                !isEqual(
                    latestPermissions?.collections?.[labels.collection],
                    originalPermissions.current?.collections?.[labels.collection],
                )
            ) {
                initializeRef.current()
                originalPermissions.current = cloneDeep(latestPermissions)
            }
        })
        return unsubscribePermissions
    }, [])

    const columns: ColumnDef<StokerRecord>[] = useMemo(() => {
        const fieldsClone = cloneDeep(fields.filter((field) => !formList || formList.fields.includes(field.name)))
        const sortedFields = fieldsClone.sort((a, b) => {
            const aCustomization = getFieldCustomization(a, customization)
            const bCustomization = getFieldCustomization(b, customization)
            const aPosition = tryFunction(aCustomization.admin?.column)
            const bPosition = tryFunction(bCustomization.admin?.column)

            if (aPosition === undefined) return 1
            if (bPosition === undefined) return -1

            return aPosition - bPosition
        })

        const selectColumnDef: ColumnDef<StokerRecord> = {
            id: "select",
            header: ({ table }) => (
                <div className="flex items-center">
                    <Checkbox
                        className="align-top"
                        checked={
                            table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <Checkbox
                    className="ml-2 align-top"
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            goToRecord(collection, row.original as StokerRecord)
                        }
                    }}
                />
            ),
            enableSorting: false,
            enableHiding: false,
        }

        const fieldColumns = sortedFields
            .filter((field) => field.type !== "Embedding")
            .map((field) => {
                const fieldCustomization = getFieldCustomization(field, customization)
                const condition = tryFunction(fieldCustomization.admin?.condition?.list, [
                    relationCollection,
                    relationParent,
                ])
                if (condition === false) return null

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const column: any = {
                    id: field.name,
                    accessorKey: field.name,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    header: ({ column }: any) => {
                        const label = tryFunction(fieldCustomization.admin?.label)
                        const listLabel = tryFunction(fieldCustomization.admin?.listLabel)
                        let className = "whitespace-nowrap text-left"
                        if (
                            !(
                                ((isPreloadCacheEnabled || isServerReadOnly) &&
                                    !["ManyToOne", "ManyToMany"].includes(field.type)) ||
                                (isSortingEnabled(field, permissions) && field.type !== "Computed") ||
                                field.name === recordTitleField
                            )
                        ) {
                            className = cn(className, "cursor-default")
                        }
                        if (field.name === recordTitleField) className = cn(className, "text-primary")
                        return (
                            <button
                                type="button"
                                className={className}
                                onClick={() => {
                                    if (
                                        isPreloadCacheEnabled ||
                                        isServerReadOnly ||
                                        (isSortingEnabled(field, permissions) && field.type !== "Computed") ||
                                        field.name === recordTitleField
                                    ) {
                                        column.toggleSorting(column.getIsSorted() === "asc")
                                    }
                                }}
                            >
                                {listLabel || label || field.name}
                                {(isPreloadCacheEnabled ||
                                    isServerReadOnly ||
                                    (isSortingEnabled(field, permissions) && field.type !== "Computed") ||
                                    field.name === recordTitleField) &&
                                    !["ManyToOne", "ManyToMany"].includes(field.type) && (
                                        <ChevronsUpDown className="ml-2 h-4 w-4 inline-block print:hidden" />
                                    )}
                            </button>
                        )
                    },
                    cell: memo(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ({ row }: any) => {
                            let className = "text-left p-2"
                            if (field.name === recordTitleField)
                                className = cn(className, "text-primary", "font-medium")

                            if (fieldCustomization.admin?.customListView) {
                                const customListView = tryFunction(fieldCustomization.admin?.customListView, [
                                    row.original,
                                    relationCollection,
                                    relationParent,
                                ])
                                if (customListView) {
                                    return (
                                        <div
                                            className={className}
                                            role="none"
                                            onClick={(e) => {
                                                if (customListView.receiveClick) {
                                                    e.stopPropagation()
                                                }
                                            }}
                                            onKeyDown={(e) => {
                                                if (customListView.receiveClick && e.key === "Enter") {
                                                    e.stopPropagation()
                                                }
                                            }}
                                        >
                                            {customListView.component({ ...customListView.props })}
                                        </div>
                                    )
                                }
                                return null
                            }
                            return (
                                <div className={className}>
                                    {getFormattedFieldValue(
                                        customization,
                                        field,
                                        row.original,
                                        connectionStatus,
                                        undefined,
                                        goToRecord,
                                    )}
                                </div>
                            )
                        },
                        (prevProps, nextProps) =>
                            prevProps.row.original.id === nextProps.row.original.id &&
                            prevProps.row.original[field.name] === nextProps.row.original[field.name],
                    ),
                }
                column.cell.displayName = `Cell-${field.name}`
                if (field.type === "String") {
                    column.sortingFn = "stringSortingFn"
                } else if (isRelationField(field)) {
                    column.sortingFn = "relationSortingFn"
                } else if (field.type === "Timestamp") {
                    column.sortingFn = "dateSortingFn"
                } else {
                    column.sortingFn = "rawSortingFn"
                }
                return column
            })
            .filter(Boolean) as ColumnDef<StokerRecord>[]

        return [selectColumnDef, ...fieldColumns]
    }, [fields, isPreloadCacheEnabled, isServerReadOnly, recordTitleField, connectionStatus])

    const searchList = useMemo(() => {
        if (search && (isPreloadCacheEnabled || isServerReadOnly)) {
            const searchResults = localFullTextSearch(collection, search, list || []).map((result) => result.id)
            return list?.filter((record) => searchResults.includes(record.id)) || []
        }
        return list || []
    }, [isPreloadCacheEnabled, isServerReadOnly, list, search])

    const table = useReactTable<StokerRecord>({
        data: searchList,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        onSortingChange: (sortingUpdater) => {
            if (typeof sortingUpdater === "function") {
                const newSorting = sortingUpdater(sorting)
                const field = getField(fields, newSorting[0].id)

                if (["ManyToOne", "ManyToMany"].includes(field.type)) return

                if (isPreloadCacheEnabled || isServerReadOnly) {
                    setSorting(sortingUpdater)
                    setState(`collection-sort-${labels.collection.toLowerCase()}`, "sort", newSorting)
                    setOrder({ field: newSorting[0].id, direction: newSorting[0].desc ? "desc" : "asc" })
                } else {
                    if (typeof field.sorting === "object" && field.sorting.direction === "asc" && newSorting[0].desc)
                        return

                    if (
                        typeof field.sorting === "object" &&
                        field.sorting.direction === "desc" &&
                        !newSorting[0].desc
                    ) {
                        setOrder({ field: newSorting[0].id, direction: "desc" })
                        setState(`collection-sort-${labels.collection.toLowerCase()}`, "sort", [
                            {
                                id: newSorting[0].id,
                                desc: true,
                            },
                        ])
                    } else {
                        setOrder({ field: newSorting[0].id, direction: newSorting[0].desc ? "desc" : "asc" })
                        setState(`collection-sort-${labels.collection.toLowerCase()}`, "sort", newSorting)
                    }
                }
            }
        },
        getSortedRowModel: getSortedRowModel(),
        onColumnFiltersChange: setColumnFilters,
        getFilteredRowModel: getFilteredRowModel(),
        onRowSelectionChange: setRowSelection,
        pageCount,
        autoResetPageIndex: false,
        enableSorting: true,
        state: {
            sorting,
            columnFilters,
            rowSelection,
            pagination: {
                pageSize,
                pageIndex,
            },
        },
        onPaginationChange: (updater) => {
            const newPagination = typeof updater === "function" ? updater({ pageIndex, pageSize }) : updater
            if (pageCount && newPagination.pageIndex < pageCount) {
                setPageIndex(newPagination.pageIndex)
            }
        },
        sortingFns: {
            /* eslint-disable security/detect-object-injection */
            stringSortingFn: (rowA, rowB, columnId) => {
                const valueA = getSortingValue(
                    collection,
                    customization,
                    columnId,
                    rowA.original,
                    relationCollection,
                    relationParent,
                )
                const valueB = getSortingValue(
                    collection,
                    customization,
                    columnId,
                    rowB.original,
                    relationCollection,
                    relationParent,
                )
                const rawA = valueA?.toString().toLowerCase()
                const rawB = valueB?.toString().toLowerCase()
                return rawA > rawB ? 1 : rawA < rawB ? -1 : 0
            },
            relationSortingFn: (rowA, rowB, columnId) => {
                const field = getField(fields, columnId)
                if (!isRelationField(field)) return 0
                const titleField = field.titleField
                if (titleField) {
                    return (Object.values(rowA.original[field.name])[0] as StokerRecord)[titleField].toLowerCase() >
                        (Object.values(rowB.original[field.name])[0] as StokerRecord)[titleField].toLowerCase()
                        ? 1
                        : (Object.values(rowA.original[field.name])[0] as StokerRecord)[titleField].toLowerCase() <
                            (Object.values(rowB.original[field.name])[0] as StokerRecord)[titleField].toLowerCase()
                          ? -1
                          : 0
                } else {
                    return (Object.keys(rowA.original[field.name])[0] as string) >
                        (Object.keys(rowB.original[field.name])[0] as string)
                        ? 1
                        : (Object.keys(rowA.original[field.name])[0] as string) <
                            (Object.keys(rowB.original[field.name])[0] as string)
                          ? -1
                          : 0
                }
            },
            dateSortingFn: (rowA, rowB, columnId) => {
                const valueA = getSortingValue(
                    collection,
                    customization,
                    columnId,
                    rowA.original,
                    relationCollection,
                    relationParent,
                )
                const valueB = getSortingValue(
                    collection,
                    customization,
                    columnId,
                    rowB.original,
                    relationCollection,
                    relationParent,
                )
                const rawA = Number(valueA?.valueOf() || 0)
                const rawB = Number(valueB?.valueOf() || 0)
                return rawA > rawB ? 1 : rawA < rawB ? -1 : 0
            },
            rawSortingFn: (rowA, rowB, columnId) => {
                const valueA = getSortingValue(
                    collection,
                    customization,
                    columnId,
                    rowA.original,
                    relationCollection,
                    relationParent,
                )
                const valueB = getSortingValue(
                    collection,
                    customization,
                    columnId,
                    rowB.original,
                    relationCollection,
                    relationParent,
                )
                const rawA = valueA
                const rawB = valueB
                return rawA > rawB ? 1 : rawA < rawB ? -1 : 0
            },
            /* eslint-enable security/detect-object-injection */
        },
    })

    useEffect(() => {
        setTable(table)
    }, [])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isInitialized && fullTextSearch && !isPreloadCacheEnabled && !isServerReadOnly) {
                backToStart()
            }
        }, 750)
        return () => clearTimeout(timer)
    }, [search])

    useEffect(() => {
        const sortState = state[`collection-sort-${labels.collection.toLowerCase()}`]
        if (table && sortState && !relationList) {
            setState(`collection-sort-${labels.collection.toLowerCase()}`, "sort", sortState)
            const newSorting = JSON.parse(sortState)
            setSorting(newSorting)
        } else if (defaultSort) {
            setSorting([{ id: defaultSort.field, desc: defaultSort.direction === "desc" }])
        } else if (recordTitleField) {
            setSorting([{ id: recordTitleField, desc: false }])
        }
    }, [table, recordTitleField])

    useEffect(() => {
        if (isPreloadCacheEnabled || isServerReadOnly) {
            if (pageCount && !pagesLoaded) {
                if (!relationList) {
                    const pageNumberState = state[`collection-page-number-${labels.collection.toLowerCase()}`]
                    if (pageNumberState) {
                        setPageIndex(parseInt(pageNumberState) - 1)
                    }
                }
                setPagesLoaded(true)
            }
        }
    }, [pageCount])

    if (!isPreloadCacheEnabled && !isServerReadOnly && pages && !pagesLoaded) {
        setPageCount(pages)
        setPagesLoaded(true)
    }

    const backToStart = useCallback(
        (itemsPerPage?: number) => {
            return new Promise<void>((resolve) => {
                if (isLoading) {
                    resolve()
                    return
                }
                setIsLoading(true)
                getData({
                    infinite: false,
                    queries: [
                        {
                            constraints,
                            options: {
                                pagination: {
                                    number: itemsPerPage || pageSize,
                                    orderByField,
                                    orderByDirection,
                                },
                            },
                        },
                    ],
                }).then(() => {
                    updatePageNumber("start")
                    setState(`collection-start-after-${labels.collection.toLowerCase()}`, "start", "DELETE_STATE")
                    setState(`collection-end-before-${labels.collection.toLowerCase()}`, "end", "DELETE_STATE")
                    setIsLoading(false)
                    resolve()
                })
            })
        },
        [pageSize, constraints, orderByField, orderByDirection, search, isLoading],
    )

    useEffect(() => {
        if (!isInitialized) return
        backToStart()
    }, [backToStartKey])

    const updatePageNumber = useCallback(
        (direction: "next" | "prev" | "start") => {
            if (!isPreloadCacheEnabled && !isServerReadOnly) {
                if (direction === "next") {
                    if (pageNumber !== pageCount) {
                        setPageNumber(pageNumber + 1)
                        setState(`collection-page-number-${labels.collection.toLowerCase()}`, "page", pageNumber + 1)
                    }
                } else if (direction === "prev") {
                    if (pageNumber !== 1) {
                        setPageNumber(pageNumber - 1)
                        setState(`collection-page-number-${labels.collection.toLowerCase()}`, "page", pageNumber - 1)
                    }
                } else if (direction === "start") {
                    setPageNumber(1)
                    setState(`collection-page-number-${labels.collection.toLowerCase()}`, "page", 1)
                }
            }
        },
        [isPreloadCacheEnabled, isServerReadOnly, pageNumber, pageCount],
    )

    useEffect(() => {
        if (!isLoading && !isPreloadCacheEnabled && !isServerReadOnly && pages) {
            if (
                pageCount &&
                !(
                    pageCount > pages &&
                    ((pageNumber === pageCount - 1 && list?.length === pageSize) || pageNumber > pageCount - 1)
                )
            ) {
                setPageCount(pages)
            }
            if (pageCount && pageNumber > pageCount) {
                backToStart()
            }
        }
    }, [pages, pageCount, pageNumber, list])

    const isPrevPageChange = useRef(false)
    const isNextPageChange = useRef(false)

    useEffect(() => {
        if (list) {
            if (!isPreloadCacheEnabled && !isServerReadOnly && pages) {
                if (pageNumber >= pages && list.length === pageSize) {
                    const newPageCount = pages + 1
                    setPageCount(newPageCount)
                }
                if (isPrevPageChange.current) {
                    isPrevPageChange.current = false
                    if (pages > 1 && list.length < pageSize) {
                        backToStart()
                    }
                }
                if (isNextPageChange.current) {
                    isNextPageChange.current = false
                    if (pageCount && pageNumber < pageCount && list.length < pageSize) {
                        setPageNumber(pages)
                    }
                }
            } else if (isInitialized && (isPreloadCacheEnabled || isServerReadOnly)) {
                const newPageCount = Math.ceil(list.length / pageSize) || 1
                if (newPageCount !== pageCount) {
                    setPageCount(newPageCount)
                }
            }
        }
    }, [list])

    const nextPage = useCallback(() => {
        if (isLoading) return
        if (isPreloadCacheEnabled || isServerReadOnly) {
            if (table.getCanNextPage()) {
                table.nextPage()
                setState(
                    `collection-page-number-${labels.collection.toLowerCase()}`,
                    "page",
                    table.getState().pagination.pageIndex + 2,
                )
            }
        } else if (!isLoading && pageCount && pageNumber < pageCount) {
            isNextPageChange.current = true
            setIsLoading(true)
            const firstDoc = cursor?.last.get(0)?.id
            if (firstDoc) {
                setState(`collection-start-after-${labels.collection.toLowerCase()}`, "start", firstDoc)
            }
            setState(`collection-end-before-${labels.collection.toLowerCase()}`, "end", "DELETE_STATE")
            getData({
                infinite: false,
                queries: [
                    {
                        constraints,
                        options: {
                            pagination: {
                                startAfter: cursor,
                                number: pageSize,
                                orderByField,
                                orderByDirection,
                            },
                        },
                    },
                ],
            })
                .then(() => {
                    updatePageNumber("next")
                    setIsLoading(false)
                })
                .catch((error) => {
                    if (error.code === "not-found") {
                        backToStart()
                    } else {
                        setIsLoading(false)
                        throw error
                    }
                })
        }
    }, [table, list, pageSize, isLoading, cursor, pageNumber, pageCount, constraints, orderByField, orderByDirection])

    const canGetNextPage = useCallback(() => {
        if (isPreloadCacheEnabled || isServerReadOnly) {
            return table.getCanNextPage()
        } else {
            return !isLoadingDebounced && pageCount && pageNumber < pageCount && list?.length === pageSize
        }
    }, [table, isLoadingDebounced, pageNumber, pageCount, list, pageSize])

    const prevPage = useCallback(() => {
        if (isLoading) return
        if (isPreloadCacheEnabled || isServerReadOnly) {
            if (table.getCanPreviousPage()) {
                table.previousPage()
                setState(
                    `collection-page-number-${labels.collection.toLowerCase()}`,
                    "page",
                    table.getState().pagination.pageIndex,
                )
            }
        } else if (!isLoading && pageNumber > 1) {
            isPrevPageChange.current = true
            setIsLoading(true)
            const firstDoc = cursor?.first.get(0)?.id
            if (pageNumber === 2) {
                backToStart()
            } else if (firstDoc) {
                setState(`collection-end-before-${labels.collection.toLowerCase()}`, "end", firstDoc)
                setState(`collection-start-after-${labels.collection.toLowerCase()}`, "start", "DELETE_STATE")
                getData({
                    infinite: false,
                    queries: [
                        {
                            constraints,
                            options: {
                                pagination: {
                                    endBefore: cursor,
                                    number: pageSize,
                                    orderByField,
                                    orderByDirection,
                                },
                            },
                        },
                    ],
                })
                    .then(() => {
                        updatePageNumber("prev")
                        setIsLoading(false)
                    })
                    .catch((error) => {
                        if (error.code === "not-found") {
                            backToStart()
                        } else {
                            setIsLoading(false)
                            throw error
                        }
                    })
            } else if (prevCursor) {
                setState(`collection-start-after-${labels.collection.toLowerCase()}`, "start", "DELETE_STATE")
                setState(`collection-end-before-${labels.collection.toLowerCase()}`, "end", "DELETE_STATE")
                getData({
                    infinite: false,
                    queries: [
                        {
                            constraints,
                            options: {
                                pagination: {
                                    startAt: prevCursor,
                                    number: pageSize,
                                    orderByField,
                                    orderByDirection,
                                },
                            },
                        },
                    ],
                })
                    .then(() => {
                        updatePageNumber("prev")
                        setIsLoading(false)
                    })
                    .catch((error) => {
                        if (error.code === "not-found") {
                            backToStart()
                        } else {
                            setIsLoading(false)
                            throw error
                        }
                    })
            }
        }
    }, [table, list, pageSize, isLoading, cursor, prevCursor, pageNumber, constraints, orderByField, orderByDirection])

    const canGetPrevPage = useCallback(() => {
        if (isPreloadCacheEnabled || isServerReadOnly) {
            return table.getCanPreviousPage()
        } else {
            return !isLoadingDebounced && pageNumber > 1
        }
    }, [table, isLoadingDebounced, pageNumber])

    const onChangePageNumber = useCallback(
        (event: React.ChangeEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
            const target = event.target as HTMLInputElement
            const number = Number(target.value)
            if (number === 0) {
                return
            }
            if (number < 0) {
                target.value = "1"
            }
            if (number > table.getPageCount()) {
                target.value = table.getPageCount().toString()
            }
            const page = target.value ? Number(target.value) - 1 : 0
            setPageIndex(page)
            setState(`collection-page-number-${labels.collection.toLowerCase()}`, "page", page + 1)
        },
        [table],
    )

    useEffect(() => {
        if (isInitialized) {
            if (!isPreloadCacheEnabled && !isServerReadOnly) {
                backToStart()
            } else {
                getData({
                    infinite: false,
                    queries: [
                        {
                            constraints,
                            options: {},
                        },
                    ],
                }).then(() => {
                    setPageIndex(0)
                    setState(`collection-page-number-${labels.collection.toLowerCase()}`, "page", 1)
                })
            }
        }
    }, [filters])

    useEffect(() => {
        if (isInitialized) {
            if (!isPreloadCacheEnabled && !isServerReadOnly) {
                backToStart().then(() => {
                    const prevOrder = table.getState().sorting
                    if (
                        order &&
                        (prevOrder.length === 0 ||
                            prevOrder[0].id !== order.field ||
                            (prevOrder[0].desc && order.direction === "asc") ||
                            (!prevOrder[0].desc && order.direction === "desc")) &&
                        !isPreloadCacheEnabled &&
                        !isServerReadOnly
                    ) {
                        setSorting([{ id: order.field, desc: order.direction === "desc" }])
                    }
                })
            }
        }
    }, [order])

    const handleDelete = useCallback(async () => {
        if (!customization) return
        const offlineDisabled = await isOfflineDisabled("delete", collection)
        if (offlineDisabled) {
            alert(`You are offline and cannot delete these records`)
            return
        }

        const titles = await getCachedConfigValue(customization, ["collections", labels.collection, "admin", "titles"])
        const recordTitle = titles?.record || labels.record

        Object.keys(rowSelection).forEach((row) => {
            const key = row as unknown as number
            if (!list) return
            // eslint-disable-next-line security/detect-object-injection
            const record = list[key]
            if (isGlobalLoading.get(record.id)?.server) {
                alert(
                    `Record ${record.id} is currently being written to the server. Please wait for it to finish before deleting.`,
                )
                return
            }
            const serverWrite = isServerDelete(collection, record)

            setOptimisticDelete(labels.collection, record.id)

            setGlobalLoading("+", record.id, serverWrite, !(serverWrite || isServerReadOnly))

            deleteRecord(record.Collection_Path, record.id)
                .then(() => {
                    if (isServerReadOnly) {
                        backToStart()
                    }
                })
                .catch((error) => {
                    console.error(error)
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} failed to delete.`,
                        variant: "destructive",
                    })
                })
                .finally(() => {
                    if (serverWrite || isServerReadOnly) {
                        removeOptimisticDelete(labels.collection, record.id)
                    }
                    setGlobalLoading("-", record.id, undefined, !(serverWrite || isServerReadOnly))
                })
            if (!serverWrite && !isServerReadOnly) {
                removeOptimisticDelete(labels.collection, record.id)
            }
        })
        toast({
            description: `Deleting ${Object.keys(rowSelection).length} ${Object.keys(rowSelection).length > 1 ? "records" : "record"}.`,
        })
    }, [collection, rowSelection, list, isGlobalLoading, softDeleteField, softDeleteTimestampField, recordTitleField])

    const sortingField = getField(fields, sorting[0]?.id)

    type MetricValue = string | { date: string; metric1: number; metric2?: number }[]

    const metricsValues: Record<string, MetricValue> = useMemo(() => {
        if (!metrics) return {} as Record<string, MetricValue>
        if (!list) return {} as Record<string, MetricValue>
        const values: Record<string, MetricValue> = {}
        metrics?.forEach((metric: Metric | Chart, index: number) => {
            if (permissions?.Role && (!metric.roles || metric.roles.includes(permissions?.Role))) {
                if (metric.type === "count") {
                    let value = (list?.length || 0).toString()
                    if (metric.prefix) {
                        value = `${metric.prefix}${value}`
                    }
                    if (metric.suffix) {
                        value = `${value}${metric.suffix}`
                    }
                    // eslint-disable-next-line security/detect-object-injection
                    values[index] = value || ""
                } else if (metric.type === "sum" && metric.field) {
                    let total = 0
                    let value: string
                    const field = getField(fields, metric.field)
                    const fieldCustomization = getFieldCustomization(field, customization)
                    list?.forEach((record: StokerRecord) => {
                        if (!metric.field) return
                        const value = record[metric.field]
                        if (field.type === "Number" && typeof value === "number") {
                            const newTotal = total + value
                            if (!Number.isFinite(newTotal) || newTotal > Number.MAX_SAFE_INTEGER) {
                                throw new Error("Numeric overflow detected in metric calculation")
                            }
                            total = newTotal
                        }
                    })
                    const currency = tryFunction(fieldCustomization?.admin?.currency)
                    if (currency) {
                        value = `${currency}${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    } else {
                        if (metric.decimal) {
                            value = total.toFixed(metric.decimal)
                        } else {
                            value = total.toString()
                        }
                        if (metric.prefix) {
                            value = `${metric.prefix}${value}`
                        }
                        if (metric.suffix) {
                            value = `${value}${metric.suffix}`
                        }
                    }
                    // eslint-disable-next-line security/detect-object-injection
                    values[index] = value || ""
                } else if (metric.type === "average" && metric.field) {
                    let total = 0
                    let value: string
                    const field = getField(fields, metric.field)
                    const fieldCustomization = getFieldCustomization(field, customization)
                    list?.forEach((record: StokerRecord) => {
                        if (!metric.field) return
                        const value = record[metric.field]
                        if (field.type === "Number" && typeof value === "number") {
                            const newTotal = total + value
                            if (!Number.isFinite(newTotal) || newTotal > Number.MAX_SAFE_INTEGER) {
                                throw new Error("Numeric overflow detected in metric calculation")
                            }
                            total = newTotal
                        }
                    })
                    const average = total / list?.length || 0
                    const currency = tryFunction(fieldCustomization?.admin?.currency)
                    if (currency) {
                        value = `${currency}${average.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    } else {
                        value = average.toFixed(metric.decimal || 2)
                        if (metric.prefix) {
                            value = `${metric.prefix}${value}`
                        }
                        if (metric.suffix) {
                            value = `${value}${metric.suffix}`
                        }
                    }
                    // eslint-disable-next-line security/detect-object-injection
                    values[index] = value || ""
                } else if (metric.type === "area") {
                    if (metric.metricField1) {
                        const chartData: MetricValue = []
                        list?.forEach((record: StokerRecord) => {
                            if (!record[metric.dateField] || !metric.metricField1) return
                            const date = DateTime.fromJSDate((record[metric.dateField] as Timestamp).toDate(), {
                                zone: timezone,
                            })
                                .toISO()
                                ?.split("T")[0]
                            const metric1 = record[metric.metricField1]
                            let metric2
                            if (metric.metricField2) {
                                metric2 = record[metric.metricField2]
                            }
                            if (date && (metric1 || metric2)) {
                                chartData.push({ date, metric1, metric2 })
                            }
                        })
                        chartData.sort((a, b) => {
                            if (a.date < b.date) return -1
                            if (a.date > b.date) return 1
                            return 0
                        })
                        // eslint-disable-next-line security/detect-object-injection
                        values[index] = chartData
                    } else {
                        const chartData: MetricValue = []
                        const dateMap = new Map<string, number>()

                        list?.forEach((record: StokerRecord) => {
                            if (!record[metric.dateField]) return
                            const date = DateTime.fromJSDate((record[metric.dateField] as Timestamp).toDate(), {
                                zone: timezone,
                            })
                                .toISO()
                                ?.split("T")[0]

                            if (date) {
                                dateMap.set(date, (dateMap.get(date) || 0) + 1)
                            }
                        })
                        Array.from(dateMap.entries())
                            .sort(([a], [b]) => {
                                if (a < b) return -1
                                if (a > b) return 1
                                return 0
                            })
                            .forEach(([date, count]) => {
                                chartData.push({ date, metric1: count })
                            })
                        // eslint-disable-next-line security/detect-object-injection
                        values[index] = chartData
                    }
                }
            }
        })
        return values
    }, [list])

    const [timeRange, setTimeRange] = useState<Record<string, string>>({})

    useEffect(() => {
        metrics?.forEach((metric: Metric | Chart, index: number) => {
            if (metric.type === "area") {
                setTimeRange((prev) => ({ ...prev, [index]: metric.defaultRange || "30d" }))
            }
        })
    }, [])

    const updateButtonRef = useRef<HTMLButtonElement>(null)

    const hasMetrics = useMemo(() => {
        return (
            metrics &&
            metrics.filter((metric: Metric | Chart) => {
                return permissions?.Role && (!metric.roles || metric.roles.includes(permissions?.Role))
            }).length > 0
        )
    }, [metrics])

    return (
        <>
            {!formList && (
                <Helmet>
                    <title>{`${meta?.title || collectionTitle || labels.collection} - List`}</title>
                    {meta?.description && <meta name="description" content={meta.description} />}
                </Helmet>
            )}
            <Card>
                <ScrollArea
                    className={cn(
                        !relationList && !formList && "min-h-screen xl:min-h-full xl:h-[calc(100vh-252px)]",
                        relationList && "xl:h-[calc(100vh-352px)]",
                        formList && "h-[264px] xl:h-[316px]",
                    )}
                >
                    <CardContent>
                        {metrics && hasMetrics && !relationList && (
                            <div className="hidden lg:flex flex-row gap-4 mb-4 mt-4">
                                {metrics.map((metric: Metric | Chart, index: number) => {
                                    if (
                                        permissions?.Role &&
                                        (!metric.roles || metric.roles.includes(permissions?.Role))
                                    ) {
                                        if (
                                            metric.type === "sum" ||
                                            metric.type === "average" ||
                                            metric.type === "count"
                                        ) {
                                            const metricTitle =
                                                metric.title || `Total ${collectionTitle || labels.collection}`
                                            return (
                                                <div
                                                    key={`metric-${index}`}
                                                    className="grid gap-3 place-content-center"
                                                >
                                                    <Card className="p-4 pt-6 pb-6 h-[175px] min-w-[175px] flex flex-col place-content-center items-center bg-blue-500 dark:bg-blue-500/50 text-primary-foreground dark:text-primary">
                                                        <div className="relative bottom-2">
                                                            <div className="font-semibold line-clamp-1 text-center">
                                                                {metricTitle}
                                                            </div>
                                                            <div
                                                                className={cn(
                                                                    "h-10",
                                                                    "flex",
                                                                    "items-center",
                                                                    "justify-center",
                                                                    "gap-2",
                                                                    "font-bold",
                                                                    "tabular-nums",
                                                                    "leading-none",
                                                                    "overflow-hidden",
                                                                    "break-words",
                                                                    metric.textSize || "text-3xl",
                                                                )}
                                                            >
                                                                {/* eslint-disable-next-line security/detect-object-injection */}
                                                                {metricsValues[index] as string}
                                                            </div>
                                                        </div>
                                                    </Card>
                                                </div>
                                            )
                                        }
                                        if (metric.type === "area") {
                                            const metricTitle =
                                                metric.title || `${collectionTitle || labels.collection} Over Time`
                                            const metricField1 = metric.metricField1
                                                ? getField(fields, metric.metricField1)
                                                : undefined
                                            const metricField1Customization = metricField1
                                                ? getFieldCustomization(metricField1, customization)
                                                : undefined
                                            const metricField1Title =
                                                tryFunction(metricField1Customization?.admin?.label) ||
                                                metricField1?.name ||
                                                "Total"
                                            const metricField2 = metric.metricField2
                                                ? getField(fields, metric.metricField2)
                                                : undefined
                                            const metricField2Customization = metricField2
                                                ? getFieldCustomization(metricField2, customization)
                                                : undefined
                                            const metricField2Title =
                                                tryFunction(metricField2Customization?.admin?.label) ||
                                                metricField2?.name

                                            const chartData =
                                                // eslint-disable-next-line security/detect-object-injection
                                                (metricsValues[index] as {
                                                    date: string
                                                    metric1: number
                                                    metric2?: number
                                                }[]) || []

                                            const chartConfig = {
                                                visitors: {
                                                    label: metricTitle,
                                                },
                                                metric1: {
                                                    label: metricField1Title,
                                                    color: "var(--chart-1)",
                                                },
                                                metric2: {
                                                    label: metricField2Title,
                                                    color: "var(--chart-2)",
                                                },
                                            } satisfies ChartConfig

                                            const filteredData = chartData?.filter((item) => {
                                                const date = new Date(item.date)
                                                let daysToSubtract = 90
                                                // eslint-disable-next-line security/detect-object-injection
                                                if (timeRange[metricTitle] === "30d") {
                                                    daysToSubtract = 30
                                                    // eslint-disable-next-line security/detect-object-injection
                                                } else if (timeRange[metricTitle] === "7d") {
                                                    daysToSubtract = 7
                                                }
                                                const startDate = DateTime.now().setZone(timezone).toJSDate()
                                                startDate.setDate(startDate.getDate() - daysToSubtract)
                                                return date >= startDate
                                            })

                                            return (
                                                <div key={`metric-${index}`} className="grid gap-3 flex-1 min-w-0">
                                                    <Card className="pt-0 w-full" key={`metric-${index}`}>
                                                        <div className="flex">
                                                            <CardHeader className="flex flex-col justify-center gap-2 space-y-0 border-r py-5 w-[200px]">
                                                                <div className="grid flex-1 gap-1">
                                                                    <CardTitle className="leading-1">
                                                                        {metricTitle}
                                                                    </CardTitle>
                                                                </div>
                                                                <Select
                                                                    // eslint-disable-next-line security/detect-object-injection
                                                                    value={timeRange[metricTitle]}
                                                                    onValueChange={(value) =>
                                                                        // eslint-disable-next-line security/detect-object-injection
                                                                        setTimeRange({
                                                                            ...timeRange,
                                                                            [metricTitle]: value,
                                                                        })
                                                                    }
                                                                >
                                                                    <SelectTrigger
                                                                        className="w-[160px] rounded-lg"
                                                                        aria-label="Select a value"
                                                                    >
                                                                        <SelectValue placeholder="Last 3 months" />
                                                                    </SelectTrigger>
                                                                    <SelectContent className="rounded-xl">
                                                                        <SelectItem value="90d" className="rounded-lg">
                                                                            Last 3 months
                                                                        </SelectItem>
                                                                        <SelectItem value="30d" className="rounded-lg">
                                                                            Last 30 days
                                                                        </SelectItem>
                                                                        <SelectItem value="7d" className="rounded-lg">
                                                                            Last 7 days
                                                                        </SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </CardHeader>
                                                            <CardContent className="flex-1 px-2 sm:px-6 pb-0">
                                                                <ChartContainer
                                                                    config={chartConfig}
                                                                    className="aspect-auto h-[173px] w-full"
                                                                >
                                                                    <AreaChart data={filteredData}>
                                                                        <defs>
                                                                            <linearGradient
                                                                                id="fill1"
                                                                                x1="0"
                                                                                y1="0"
                                                                                x2="0"
                                                                                y2="1"
                                                                            >
                                                                                <stop
                                                                                    offset="5%"
                                                                                    stopColor="var(--chart-dark)"
                                                                                    stopOpacity={0.8}
                                                                                />
                                                                                <stop
                                                                                    offset="95%"
                                                                                    stopColor="var(--chart-light)"
                                                                                    stopOpacity={0.1}
                                                                                />
                                                                            </linearGradient>
                                                                            <linearGradient
                                                                                id="fill2"
                                                                                x1="0"
                                                                                y1="0"
                                                                                x2="0"
                                                                                y2="1"
                                                                            >
                                                                                <stop
                                                                                    offset="5%"
                                                                                    stopColor="var(--chart-dark)"
                                                                                    stopOpacity={0.8}
                                                                                />
                                                                                <stop
                                                                                    offset="95%"
                                                                                    stopColor="var(--chart-light)"
                                                                                    stopOpacity={0.1}
                                                                                />
                                                                            </linearGradient>
                                                                        </defs>
                                                                        <CartesianGrid
                                                                            vertical={false}
                                                                            className="last:opacity-0"
                                                                        />
                                                                        <XAxis
                                                                            dataKey="date"
                                                                            tickLine={false}
                                                                            axisLine={false}
                                                                            tickMargin={8}
                                                                            minTickGap={32}
                                                                            tickFormatter={(value) => {
                                                                                const date = new Date(value)
                                                                                return date.toLocaleDateString(
                                                                                    "en-US",
                                                                                    {
                                                                                        month: "short",
                                                                                        day: "numeric",
                                                                                    },
                                                                                )
                                                                            }}
                                                                        />
                                                                        <YAxis hide padding={{ top: 16 }} />
                                                                        <ChartTooltip
                                                                            cursor={false}
                                                                            content={
                                                                                <ChartTooltipContent
                                                                                    labelFormatter={(value) => {
                                                                                        return new Date(
                                                                                            value,
                                                                                        ).toLocaleDateString("en-US", {
                                                                                            month: "short",
                                                                                            day: "numeric",
                                                                                        })
                                                                                    }}
                                                                                    indicator="dot"
                                                                                />
                                                                            }
                                                                        />
                                                                        <Area
                                                                            dataKey="metric1"
                                                                            type="natural"
                                                                            fill="url(#fill1)"
                                                                            stroke="var(--chart-dark)"
                                                                            stackId="a"
                                                                        />
                                                                        {metricField2 && (
                                                                            <Area
                                                                                dataKey="metric2"
                                                                                type="natural"
                                                                                fill="url(#fill2)"
                                                                                stroke="var(--chart-light)"
                                                                                stackId="a"
                                                                            />
                                                                        )}
                                                                        {metricField1 && metricField2 && (
                                                                            <ChartLegend
                                                                                className="pb-3"
                                                                                content={<ChartLegendContent />}
                                                                            />
                                                                        )}
                                                                    </AreaChart>
                                                                </ChartContainer>
                                                            </CardContent>
                                                        </div>
                                                    </Card>
                                                </div>
                                            )
                                        }
                                    }
                                    return null
                                })}
                            </div>
                        )}
                        {Object.keys(rowSelection).length > 0 && collectionPermissions && (
                            <div className="flex items-center justify-start gap-3 text-sm text-muted-foreground pt-3 pb-2">
                                <div>
                                    {table.getFilteredSelectedRowModel().rows.length} of{" "}
                                    {table.getFilteredRowModel().rows.length} row(s) selected.
                                </div>
                                {collectionAccess("Update", collectionPermissions) && (
                                    <Button
                                        type="button"
                                        ref={updateButtonRef}
                                        onClick={() => setIsUpdateDialogOpen(true)}
                                    >
                                        Update Selected
                                    </Button>
                                )}
                                {isUpdateDialogOpen &&
                                    createPortal(
                                        <div
                                            id="update-records-modal"
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
                                                        <h4 id="dialog-title" className="font-medium leading-none">
                                                            Update {collectionTitle || labels.collection}
                                                        </h4>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="right-4 top-4"
                                                            onClick={() => {
                                                                setIsUpdateDialogOpen(false)
                                                                setTimeout(() => {
                                                                    updateButtonRef.current?.focus()
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
                                                        operation="update-many"
                                                        path={[labels.collection]}
                                                        onSuccess={() => {
                                                            setIsUpdateDialogOpen(false)
                                                            setTimeout(() => {
                                                                updateButtonRef.current?.focus()
                                                            }, 0)
                                                            if (isServerReadOnly) {
                                                                setBackToStartKey((prev) => prev + 1)
                                                            }
                                                        }}
                                                        onSaveRecord={() => {
                                                            setOptimisticList()
                                                        }}
                                                        rowSelection={Object.keys(rowSelection)
                                                            .map((row) => {
                                                                const key = row as unknown as number
                                                                if (!list) return undefined
                                                                // eslint-disable-next-line security/detect-object-injection
                                                                return list[key]
                                                            })
                                                            .filter(
                                                                (record): record is StokerRecord =>
                                                                    record !== undefined,
                                                            )}
                                                    />
                                                </div>
                                            </div>
                                        </div>,
                                        document.body,
                                    )}
                                {((!softDelete && collectionAccess("Delete", collectionPermissions)) ||
                                    (softDelete && collectionAccess("Update", collectionPermissions))) && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                disabled={
                                                    connectionStatus === "offline" &&
                                                    (disableOfflineDelete || serverWriteOnly || collection.auth)
                                                }
                                            >
                                                Delete Selected
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                                <AlertDialogDescription className="hidden">
                                                    This action delete the selected records.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDelete}>
                                                    Delete selected
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                            </div>
                        )}
                        {pagesLoaded && list && (
                            <Table className="list-table">
                                <TableHeader>
                                    {table.getHeaderGroups().map((headerGroup) => (
                                        <TableRow key={headerGroup.id}>
                                            {headerGroup.headers.map((header) => {
                                                let className = ""
                                                if (header.id !== "select") {
                                                    const field = getField(fields, header.id)
                                                    const fieldCustomization = getFieldCustomization(
                                                        field,
                                                        customization,
                                                    )
                                                    const hidden = tryFunction(fieldCustomization.admin?.hidden)
                                                    if (hidden) {
                                                        switch (hidden) {
                                                            case "sm":
                                                                className = cn(className, "hidden", "sm:table-cell")
                                                                break
                                                            case "md":
                                                                className = cn(className, "hidden", "md:table-cell")
                                                                break
                                                            case "lg":
                                                                className = cn(className, "hidden", "lg:table-cell")
                                                                break
                                                            case "xl":
                                                                className = cn(className, "hidden", "xl:table-cell")
                                                                break
                                                            case "2xl":
                                                                className = cn(className, "hidden", "2xl:table-cell")
                                                                break
                                                        }
                                                    }
                                                } else {
                                                    className = "w-8"
                                                }
                                                return (
                                                    <TableHead key={header.id} className={className}>
                                                        {header.isPlaceholder
                                                            ? null
                                                            : flexRender(
                                                                  header.column.columnDef.header,
                                                                  header.getContext(),
                                                              )}
                                                    </TableHead>
                                                )
                                            })}
                                        </TableRow>
                                    ))}
                                </TableHeader>
                                <TableBody>
                                    {table.getRowModel().rows?.length ? (
                                        table.getRowModel().rows.map((row: Row<unknown>) => {
                                            let className = "odd:bg-muted dark:odd:bg-primary-foreground"
                                            const highlights: RowHighlight[] = []
                                            rowHighlight?.forEach((rowHighlight) => {
                                                if (
                                                    permissions.Role &&
                                                    (!rowHighlight.roles ||
                                                        rowHighlight.roles.includes(permissions.Role))
                                                ) {
                                                    highlights.push(rowHighlight)
                                                }
                                            })
                                            highlights.forEach((highlight) => {
                                                if (highlight.condition(row.original as StokerRecord)) {
                                                    className = highlight.className
                                                }
                                            })
                                            return (
                                                <TableRow
                                                    key={row.id}
                                                    data-state={row.getIsSelected() && "selected"}
                                                    className={cn("dark:hover:bg-muted", className)}
                                                >
                                                    {row.getVisibleCells().map((cell: Cell<unknown, unknown>) => {
                                                        let className = "p-0"
                                                        const id = cell.column.columnDef.id
                                                        if (id !== "select") {
                                                            const field = getField(fields, id)
                                                            const fieldCustomization = getFieldCustomization(
                                                                field,
                                                                customization,
                                                            )
                                                            const hidden = tryFunction(fieldCustomization.admin?.hidden)
                                                            if (hidden) {
                                                                switch (hidden) {
                                                                    case "sm":
                                                                        className = cn(
                                                                            className,
                                                                            "hidden",
                                                                            "sm:table-cell",
                                                                        )
                                                                        break
                                                                    case "md":
                                                                        className = cn(
                                                                            className,
                                                                            "hidden",
                                                                            "md:table-cell",
                                                                        )
                                                                        break
                                                                    case "lg":
                                                                        className = cn(
                                                                            className,
                                                                            "hidden",
                                                                            "lg:table-cell",
                                                                        )
                                                                        break
                                                                    case "xl":
                                                                        className = cn(
                                                                            className,
                                                                            "hidden",
                                                                            "xl:table-cell",
                                                                        )
                                                                        break
                                                                    case "2xl":
                                                                        className = cn(
                                                                            className,
                                                                            "hidden",
                                                                            "2xl:table-cell",
                                                                        )
                                                                        break
                                                                }
                                                            }
                                                            if (
                                                                !isRelationField(field) ||
                                                                ["ManyToOne", "ManyToMany"].includes(field.type)
                                                            ) {
                                                                className = cn(className, "cursor-pointer")
                                                            }
                                                        }
                                                        return (
                                                            <TableCell
                                                                key={cell.id}
                                                                className={cn(
                                                                    className,
                                                                    "max-w-[150px] md:max-w-[300px] overflow-hidden break-words",
                                                                )}
                                                                onClick={() => {
                                                                    const field = getField(fields, id)
                                                                    if (
                                                                        id !== "select" &&
                                                                        !["OneToOne", "OneToMany"].includes(field.type)
                                                                    ) {
                                                                        goToRecord(
                                                                            collection,
                                                                            row.original as StokerRecord,
                                                                        )
                                                                    }
                                                                }}
                                                                onKeyDown={(event) => {
                                                                    const field = getField(fields, id)
                                                                    if (
                                                                        id !== "select" &&
                                                                        event.key === "Enter" &&
                                                                        !["OneToOne", "OneToMany"].includes(field.type)
                                                                    ) {
                                                                        goToRecord(
                                                                            collection,
                                                                            row.original as StokerRecord,
                                                                        )
                                                                    }
                                                                }}
                                                            >
                                                                {flexRender(
                                                                    cell.column.columnDef.cell,
                                                                    cell.getContext(),
                                                                )}
                                                            </TableCell>
                                                        )
                                                    })}
                                                </TableRow>
                                            )
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={columns.length} className="h-24 text-center">
                                                No results.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>
            </Card>
            <div className="flex items-center justify-end space-x-2 py-4 print:hidden">
                {pagesLoaded && (
                    <Badge variant="secondary" className="hidden sm:block">
                        Page{" "}
                        {isPreloadCacheEnabled || isServerReadOnly
                            ? table.getState().pagination.pageIndex + 1
                            : pageNumber}{" "}
                        of {table.getPageCount()}
                    </Badge>
                )}
                {(isPreloadCacheEnabled || isServerReadOnly) && (
                    <div className="flex items-center space-x-2">
                        <Badge variant="secondary" className="hidden sm:block">
                            Go to page:{" "}
                        </Badge>
                        <input
                            type="number"
                            defaultValue={table.getState().pagination.pageIndex + 1}
                            onChange={onChangePageNumber}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    onChangePageNumber(event)
                                }
                            }}
                            className="h-8 w-16 p-1 border rounded-md text-center text-sm dark:bg-primary-foreground dark:border-primary-foreground"
                        />
                    </div>
                )}
                {!isPreloadCacheEnabled && !isServerReadOnly && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            backToStart()
                        }}
                        disabled={(pageNumber === 1 && !(list && list.length < pageSize)) || isLoadingDebounced}
                    >
                        Back to start
                    </Button>
                )}
                {!(
                    !isPreloadCacheEnabled &&
                    !isServerReadOnly &&
                    typeof sortingField?.sorting === "object" &&
                    sortingField.sorting.direction
                ) && (
                    <Button type="button" variant="outline" size="sm" onClick={prevPage} disabled={!canGetPrevPage()}>
                        Previous
                    </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={nextPage} disabled={!canGetNextPage()}>
                    Next
                </Button>
            </div>
        </>
    )
}

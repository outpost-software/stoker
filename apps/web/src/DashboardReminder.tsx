import { DashboardReminder as Reminder, RowHighlight, StokerCollection, StokerRecord } from "@stoker-platform/types"
import {
    getCachedConfigValue,
    getCollectionConfigModule,
    getLoadingState,
    getSchema,
} from "@stoker-platform/web-client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { useGoToRecord } from "./utils/goToRecord"
import { Unsubscribe } from "firebase/auth"
import { getData } from "./utils/getData"
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "./components/ui/table"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { Button } from "./components/ui/button"
import { Card, CardContent } from "./components/ui/card"
import { useConnection } from "./providers/ConnectionProvider"
import { getField, getFieldCustomization, isRelationField, tryFunction } from "@stoker-platform/utils"
import { getFormattedFieldValue } from "./utils/getFormattedFieldValue"

interface DashboardReminderProps {
    reminder: Reminder
    title: string | undefined
    collection: StokerCollection
}

export const DashboardReminder = ({ reminder, title, collection }: DashboardReminderProps) => {
    const schema = getSchema(true)
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    const { labels, fields, softDelete, recordTitleField } = collectionSchema
    const customization = getCollectionConfigModule(collection)

    const metricTitle = reminder.title || `Total ${title || collection}`

    const [connectionStatus] = useConnection()
    const goToRecord = useGoToRecord()
    const isPreloadCacheEnabled = preloadCacheEnabled(collectionSchema)

    const [results, setResults] = useState<StokerRecord[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const isPreloading = getLoadingState()[labels.collection]
    const [isCacheLoading, setIsCacheLoading] = useState(!isPreloading || isPreloading === "Loading")
    const [unsubscribe, setUnsubscribe] = useState<Unsubscribe[] | undefined>(undefined)
    const [page, setPage] = useState(0)
    const [collectionTitle, setCollectionTitle] = useState<string | undefined>(undefined)
    const [sorting, setSorting] = useState<{ field: string; direction: "asc" | "desc" } | undefined>(undefined)
    const [rowHighlight, setRowHighlight] = useState<RowHighlight[] | undefined>(undefined)
    const pages = 5

    const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const debouncedSetIsLoading = useCallback((loading: boolean) => {
        if (loading) {
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current)
            }
            loadingTimeoutRef.current = setTimeout(() => {
                setIsLoading(true)
            }, 500)
        } else {
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current)
                loadingTimeoutRef.current = null
            }
            setIsLoading(false)
        }
    }, [])

    const constraints = useMemo(() => {
        const existingConstraints = [...(reminder.constraints || [])]
        if (softDelete) {
            existingConstraints.push(["Archived", "==", false])
        }
        return existingConstraints
    }, [])

    useEffect(() => {
        const initialize = async () => {
            const titles = await getCachedConfigValue(customization, ["collections", collection, "admin", "titles"])
            setCollectionTitle(titles?.collection || collection)
            const defaultSort = await getCachedConfigValue(customization, [
                "collections",
                collection,
                "admin",
                "defaultSort",
            ])
            setSorting(reminder.sort || defaultSort || { field: recordTitleField, direction: "asc" })
            const rowHighlight = await getCachedConfigValue(customization, [
                "collections",
                collection,
                "admin",
                "rowHighlight",
            ])
            setRowHighlight(rowHighlight)
        }
        initialize()
        debouncedSetIsLoading(true)
        getData(collectionSchema, constraints, debouncedSetIsLoading, setResults, setUnsubscribe)
        return () => {
            unsubscribe?.forEach((unsubscribe) => unsubscribe())
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current)
            }
        }
    }, [])

    const cacheLoading = useCallback(() => {
        setIsCacheLoading(true)
    }, [])

    const cacheLoaded = useCallback(() => {
        setIsCacheLoading(false)
    }, [constraints])

    useEffect(() => {
        if (isPreloadCacheEnabled) {
            document.addEventListener(`stoker:loading:${labels.collection}`, cacheLoading)
            document.addEventListener(`stoker:loaded:${labels.collection}`, cacheLoaded)
            const isPreloading = getLoadingState()[labels.collection]
            if (isPreloading === "Loaded") {
                cacheLoaded()
            }
        }
        return () => {
            if (isPreloadCacheEnabled) {
                document.removeEventListener(`stoker:loading:${labels.collection}`, cacheLoading)
                document.removeEventListener(`stoker:loaded:${labels.collection}`, cacheLoaded)
            }
        }
    }, [])

    return (
        <div className="h-[325px] w-full">
            <Card className="h-full pb-4">
                <CardContent className="p-4 h-full overflow-y-auto">
                    <Table className="table-fixed">
                        <TableHeader>
                            <TableRow>
                                {/* eslint-disable-next-line security/detect-object-injection */}
                                <TableHead className="w-full" colSpan={reminder.columns?.length}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-primary text-[16px] font-[600]">{metricTitle}</span>
                                        {!isLoading &&
                                            !(isPreloadCacheEnabled && isCacheLoading) &&
                                            results.length > pages && (
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setPage(Math.max(0, page - 1))}
                                                        disabled={page === 0}
                                                    >
                                                        Previous
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() =>
                                                            setPage(
                                                                Math.min(
                                                                    Math.ceil(results.length / pages) - 1,
                                                                    page + 1,
                                                                ),
                                                            )
                                                        }
                                                        disabled={page >= Math.ceil(results.length / pages) - 1}
                                                    >
                                                        Next
                                                    </Button>
                                                </div>
                                            )}
                                    </div>
                                </TableHead>
                            </TableRow>
                            <TableRow>
                                {reminder.columns?.map((column) => {
                                    const field = getField(fields, column)
                                    const fieldCustomization = getFieldCustomization(field, customization)
                                    const listLabel = tryFunction(fieldCustomization.admin?.listLabel)
                                    const label = tryFunction(fieldCustomization.admin?.label)
                                    return (
                                        <TableHead key={column} className="w-1/3">
                                            <span>{listLabel || label || column}</span>
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        </TableHeader>
                        {connectionStatus === "online" || isPreloadCacheEnabled ? (
                            <TableBody>
                                {isLoading || (isPreloadCacheEnabled && isCacheLoading) ? (
                                    <TableRow>
                                        <TableCell colSpan={reminder.columns?.length} className="text-center">
                                            <div className="flex justify-center">
                                                <LoadingSpinner size={7} />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    results
                                        .slice(page * pages, (page + 1) * pages)
                                        .sort((a, b) => {
                                            if (!sorting) return 0
                                            const sortingField = getField(fields, sorting.field)
                                            const fieldCustomization = getFieldCustomization(
                                                sortingField,
                                                customization,
                                            )
                                            let sortA = a[sorting.field]
                                            let sortB = b[sorting.field]
                                            if (fieldCustomization.admin?.sort) {
                                                sortA = tryFunction(fieldCustomization.admin?.sort, [a])
                                                sortB = tryFunction(fieldCustomization.admin?.sort, [b])
                                            }
                                            if (sorting.direction === "asc") {
                                                return sortA - sortB
                                            } else {
                                                return sortB - sortA
                                            }
                                        })
                                        .map((result: StokerRecord) => (
                                            <TableRow
                                                key={result.id}
                                                className={rowHighlight
                                                    ?.map((highlight) =>
                                                        highlight.condition(result) ? highlight.className : "",
                                                    )
                                                    .join(" ")}
                                            >
                                                {reminder.columns?.map((column) => (
                                                    <TableCell
                                                        key={column}
                                                        className="cursor-pointer h-[40px]"
                                                        onClick={() => {
                                                            const field = getField(fields, column)
                                                            if (!isRelationField(field)) {
                                                                goToRecord(collectionSchema, result)
                                                            }
                                                        }}
                                                    >
                                                        {getFormattedFieldValue(
                                                            customization,
                                                            getField(fields, column),
                                                            result,
                                                            connectionStatus,
                                                            undefined,
                                                            goToRecord,
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                )}
                            </TableBody>
                        ) : (
                            <TableBody>
                                <TableRow>
                                    <TableCell
                                        colSpan={reminder.columns?.length || 1}
                                        className="text-center h-10 text-primary/50"
                                    >
                                        <span>{collectionTitle} are not available in offline mode.</span>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        )}
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}

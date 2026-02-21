import { DashboardMetric as Metric, StokerCollection, StokerRecord } from "@stoker-platform/types"
import { Card } from "./components/ui/card"
import { cn } from "./lib/utils"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getField, getFieldCustomization, tryFunction } from "@stoker-platform/utils"
import { getCollectionConfigModule, getLoadingState, getSchema } from "@stoker-platform/web-client"
import { Unsubscribe } from "firebase/auth"
import { getData } from "./utils/getData"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { useConnection } from "./providers/ConnectionProvider"
import { WhereFilterOp } from "firebase/firestore"

interface DashboardMetricProps {
    metric: Metric
    title: string | undefined
    collection: StokerCollection
}

export const DashboardMetric = ({ metric, title, collection }: DashboardMetricProps) => {
    const schema = getSchema(true)
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    const { labels, fields, softDelete } = collectionSchema
    const customization = getCollectionConfigModule(collection)
    const isPreloadCacheEnabled = preloadCacheEnabled(collectionSchema)
    const [connectionStatus] = useConnection()

    const metricTitle = metric.title || `Total ${title || collection}`

    const [results, setResults] = useState<StokerRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const isPreloading = getLoadingState()[labels.collection]
    const [isCacheLoading, setIsCacheLoading] = useState(!isPreloading || isPreloading === "Loading")
    const [unsubscribe, setUnsubscribe] = useState<Unsubscribe[] | undefined>(undefined)

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
        const existingConstraints: [string, WhereFilterOp, unknown][] = []
        if (softDelete) {
            existingConstraints.push(["Archived", "==", false])
        }
        return existingConstraints
    }, [])

    useEffect(() => {
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

    const metricValue: string = useMemo(() => {
        if (!results) return ""
        if (metric.type === "count") {
            let value = (results?.length || 0).toString()
            if (metric.prefix) {
                value = `${metric.prefix}${value}`
            }
            if (metric.suffix) {
                value = `${value}${metric.suffix}`
            }
            return value
        } else if (metric.type === "sum" && metric.field) {
            const field = getField(fields, metric.field)
            const fieldCustomization = getFieldCustomization(field, customization)
            let total = 0
            let value: string
            if (!metric.field) return ""
            results?.forEach((record: StokerRecord) => {
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
            return value
        } else if (metric.type === "average" && metric.field) {
            const field = getField(fields, metric.field)
            const fieldCustomization = getFieldCustomization(field, customization)
            let total = 0
            let value: string
            results?.forEach((record: StokerRecord) => {
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
            const average = total / results?.length || 0
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
            return value
        }
        return ""
    }, [results])

    return (
        <div className="grid gap-3 h-full items-center bg-background rounded-xl">
            <Card className="p-4 pt-6 pb-6 h-full flex flex-col justify-center items-center bg-blue-500 dark:bg-blue-500/50 text-primary-foreground dark:text-primary border-transparent dark:border-background">
                <div className="text-[16px] font-[600] line-clamp-1 text-center">{metricTitle}</div>
                {connectionStatus === "online" || isPreloadCacheEnabled ? (
                    isLoading || (isPreloadCacheEnabled && isCacheLoading) ? (
                        <div className="flex items-center justify-center min-h-10">
                            <LoadingSpinner size={7} />
                        </div>
                    ) : (
                        <div
                            className={cn(
                                "min-h-10",
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
                            {metricValue}
                        </div>
                    )
                ) : (
                    <div className="flex items-center justify-center h-10 text-primary/50 text-center mt-4">
                        <span>Not available in offline mode.</span>
                    </div>
                )}
            </Card>
        </div>
    )
}

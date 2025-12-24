import { DashboardChart as Chart, StokerCollection, StokerRecord } from "@stoker-platform/types"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { getField, getFieldCustomization, tryFunction } from "@stoker-platform/utils"
import { getCollectionConfigModule, getLoadingState, getSchema, getTimezone } from "@stoker-platform/web-client"
import { Timestamp, Unsubscribe, WhereFilterOp } from "firebase/firestore"
import { DateTime } from "luxon"
import {
    ChartConfig,
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
} from "./components/ui/chart"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { getData } from "./utils/getData"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { useConnection } from "./providers/ConnectionProvider"

interface DashboardChartProps {
    chart: Chart
    title: string | undefined
    collection: StokerCollection
}

export const DashboardChart = ({ chart, title, collection }: DashboardChartProps) => {
    const schema = getSchema(true)
    const timezone = getTimezone()
    const [connectionStatus] = useConnection()
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection]
    const { labels, fields, softDelete } = collectionSchema
    const customization = getCollectionConfigModule(collection)
    const isPreloadCacheEnabled = preloadCacheEnabled(collectionSchema)

    const metricTitle = chart.title || `${title || collection} Over Time`

    const [results, setResults] = useState<StokerRecord[]>([])
    const [isLoading, setIsLoading] = useState(false)
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
        getData(collectionSchema, constraints, debouncedSetIsLoading, setResults, setUnsubscribe)
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

    type ChartData = { date: string; metric1: number; metric2?: number }[]

    const [timeRange, setTimeRange] = useState<string | undefined>(undefined)

    useEffect(() => {
        if (chart.type === "area") {
            setTimeRange(chart.defaultRange || "30d")
        }
    }, [])

    const chartData: ChartData = useMemo(() => {
        if (!results) return []
        const chartData: ChartData = []
        if (chart.metricField1) {
            results?.forEach((record: StokerRecord) => {
                if (!record[chart.dateField] || !chart.metricField1) return
                const date = DateTime.fromJSDate((record[chart.dateField] as Timestamp).toDate(), {
                    zone: timezone,
                })
                    .toISO()
                    ?.split("T")[0]
                const metric1 = record[chart.metricField1]
                let metric2
                if (chart.metricField2) {
                    metric2 = record[chart.metricField2]
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
        } else {
            const dateMap = new Map<string, number>()

            results?.forEach((record: StokerRecord) => {
                if (!record[chart.dateField]) return
                const date = DateTime.fromJSDate((record[chart.dateField] as Timestamp).toDate(), {
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
            chartData.sort((a, b) => {
                if (a.date < b.date) return -1
                if (a.date > b.date) return 1
                return 0
            })
        }

        return chartData?.filter((item) => {
            const date = new Date(item.date)
            let daysToSubtract = 90
            // eslint-disable-next-line security/detect-object-injection
            if (timeRange === "30d") {
                daysToSubtract = 30
                // eslint-disable-next-line security/detect-object-injection
            } else if (timeRange === "7d") {
                daysToSubtract = 7
            }
            const startDate = DateTime.now().setZone(timezone).toJSDate()
            startDate.setDate(startDate.getDate() - daysToSubtract)
            return date >= startDate
        })
    }, [results, timeRange])

    const metricField1 = chart.metricField1 ? getField(fields, chart.metricField1) : undefined
    const metricField1Customization = metricField1 ? getFieldCustomization(metricField1, customization) : undefined
    const metricField1Title = tryFunction(metricField1Customization?.admin?.label) || metricField1?.name || "Total"
    const metricField2 = chart.metricField2 ? getField(fields, chart.metricField2) : undefined
    const metricField2Customization = metricField2 ? getFieldCustomization(metricField2, customization) : undefined
    const metricField2Title = tryFunction(metricField2Customization?.admin?.label) || metricField2?.name

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

    return (
        <div className="grid gap-3 flex-1 min-w-0 h-full w-full">
            <Card className="pt-0 w-full h-full">
                <div className="grid 2xl:flex h-full">
                    <CardHeader className="flex flex-col justify-center gap-2 space-y-0 2xl:border-r pb-0 2xl:pb-5 pt-5 w-[200px]">
                        <div className="grid flex-1 gap-1">
                            <CardTitle>{metricTitle}</CardTitle>
                        </div>
                        {!isLoading && timeRange && !(isPreloadCacheEnabled && isCacheLoading) && (
                            <Select
                                // eslint-disable-next-line security/detect-object-injection
                                value={timeRange}
                                onValueChange={(value) =>
                                    // eslint-disable-next-line security/detect-object-injection
                                    setTimeRange(value)
                                }
                            >
                                <SelectTrigger className="w-[160px] rounded-lg" aria-label="Select a value">
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
                        )}
                    </CardHeader>
                    <CardContent className="flex-1 px-2 sm:px-6 pb-0">
                        {connectionStatus === "online" || isPreloadCacheEnabled ? (
                            isLoading || (isPreloadCacheEnabled && isCacheLoading) ? (
                                <div className="flex items-center justify-center h-[294px] md:h-[269px] 2xl:h-[325px]">
                                    <LoadingSpinner size={7} className="relative bottom-6" />
                                </div>
                            ) : (
                                <ChartContainer
                                    config={chartConfig}
                                    className="aspect-auto w-full h-[250px] md:h-[225px] 2xl:h-[325px]"
                                >
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="fill1" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--chart-dark)" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="var(--chart-light)" stopOpacity={0.1} />
                                            </linearGradient>
                                            <linearGradient id="fill2" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="var(--chart-dark)" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="var(--chart-light)" stopOpacity={0.1} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid vertical={false} className="last:opacity-0" />
                                        <XAxis
                                            dataKey="date"
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={8}
                                            minTickGap={32}
                                            tickFormatter={(value) => {
                                                const date = new Date(value)
                                                return date.toLocaleDateString("en-US", {
                                                    month: "short",
                                                    day: "numeric",
                                                })
                                            }}
                                        />
                                        <YAxis hide padding={{ top: 16 }} />
                                        <ChartTooltip
                                            cursor={false}
                                            content={
                                                <ChartTooltipContent
                                                    labelFormatter={(value) => {
                                                        return new Date(value).toLocaleDateString("en-US", {
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
                                        {metricField1 && (
                                            <ChartLegend className="pb-3" content={<ChartLegendContent />} />
                                        )}
                                    </AreaChart>
                                </ChartContainer>
                            )
                        ) : (
                            <div className="flex items-center justify-center h-[200px]">
                                <span className="relative bottom-10">Not available in offline mode.</span>
                            </div>
                        )}
                    </CardContent>
                </div>
            </Card>
        </div>
    )
}

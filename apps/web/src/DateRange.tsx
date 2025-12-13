import { CollectionSchema, RangeFilter } from "@stoker-platform/types"
import { cn } from "./lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover"
import { Button } from "./components/ui/button"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { Calendar } from "./components/ui/calendar"
import { startTransition, useCallback, useEffect, useState } from "react"
import { DateRange } from "react-day-picker"
import { useFilters } from "./providers/FiltersProvider"
import { useStokerState } from "./providers/StateProvider"
import { keepTimezone, getTimezone, removeTimezone, getCollectionConfigModule } from "@stoker-platform/web-client"
import { useRouteLoading } from "./providers/LoadingProvider"
import { useLocation } from "react-router"
import MonthPicker from "./components/ui/month-picker"
import { DateTime } from "luxon"
import { useCache } from "./providers/CacheProvider"
import { expandCache } from "./utils/expandCache"
import { CachePicker } from "./CachePicker"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs"
import { useConnection } from "./providers/ConnectionProvider"
import { tryFunction } from "@stoker-platform/utils"

interface DateRangeSelectorProps {
    collection: CollectionSchema
    rangeSelector: "range" | "week" | "month" | undefined
    setRangeSelector: (selector: "range" | "week" | "month" | undefined) => void
    className?: string
    relationList?: boolean
}

export function DateRangeSelector({
    collection,
    rangeSelector,
    setRangeSelector,
    className,
    relationList,
}: DateRangeSelectorProps) {
    const { labels, preloadCache } = collection
    const location = useLocation()
    const timezone = getTimezone()
    const [connectionStatus] = useConnection()

    const [range, setRange] = useState<DateRange | undefined>(undefined)
    const [month, setMonth] = useState<Date | undefined>(undefined)
    const [rangeFilter, setRangeFilter] = useState<RangeFilter | undefined>(undefined)
    const { currentField: currentFieldAll, preloadRange: preloadRangeAll, setPreloadRange } = useCache()
    const currentField = currentFieldAll[labels.collection]
    const preloadRange = preloadRangeAll?.[labels.collection]
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)
    const { filters, setFilters } = useFilters()
    const [, setState] = useStokerState()
    const [isInitialized, setIsInitialized] = useState(false)

    const { isRouteLoading, isRouteLoadingImmediate } = useRouteLoading()

    useEffect(() => {
        if (filters.length === 0 || isInitialized) return
        const rangeFilter = filters.find((filter) => filter.type === "range")
        setRangeFilter(rangeFilter)
        if (!rangeFilter) return
        if (rangeFilter.value) {
            const rangeState = JSON.parse(rangeFilter.value)
            if (rangeState.from) {
                const startWithoutOffsets = DateTime.fromISO(rangeState.from)
                    .minus({ days: rangeFilter.startOffsetDays || preloadCache?.range?.startOffsetDays || 0 })
                    .minus({ hours: rangeFilter.startOffsetHours || preloadCache?.range?.startOffsetHours || 0 })
                    .toJSDate()

                const endWithoutOffsets = DateTime.fromISO(rangeState.to)
                    .minus({ days: rangeFilter.endOffsetDays || preloadCache?.range?.endOffsetDays || 0 })
                    .minus({ hours: rangeFilter.endOffsetHours || preloadCache?.range?.endOffsetHours || 0 })
                    .toJSDate()

                setMonth(startWithoutOffsets)
                setRange({
                    from: keepTimezone(startWithoutOffsets, timezone),
                    to: keepTimezone(endWithoutOffsets, timezone),
                })
            }
        }
        setIsInitialized(true)
    }, [filters])

    const handleSelect = useCallback(
        (value: DateRange | Date | undefined) => {
            if (!value || !isInitialized) return

            if (value instanceof Date) {
                if (rangeSelector === "week") {
                    value = { from: value, to: DateTime.fromJSDate(value).endOf("week").toJSDate() }
                } else {
                    const from = value
                    const to = DateTime.fromJSDate(from).endOf("month").toJSDate()
                    value = { from, to }
                }
            }

            if (!rangeFilter) return

            setRange(value)

            value = {
                from: value.from
                    ? DateTime.fromJSDate(value.from)
                          .plus({ days: rangeFilter.startOffsetDays || preloadCache?.range?.startOffsetDays || 0 })
                          .plus({ hours: rangeFilter.startOffsetHours || preloadCache?.range?.startOffsetHours || 0 })
                          .toJSDate()
                    : undefined,
                to: value.to
                    ? DateTime.fromJSDate(value.to)
                          .plus({ days: rangeFilter.endOffsetDays || preloadCache?.range?.endOffsetDays || 0 })
                          .plus({ hours: rangeFilter.endOffsetHours || preloadCache?.range?.endOffsetHours || 0 })
                          .toJSDate()
                    : undefined,
            }

            if (!(value.from && value.to)) return

            value = {
                from: removeTimezone(value.from, timezone),
                to: value.to ? removeTimezone(value.to, timezone) : undefined,
            }

            startTransition(() => {
                setFilters((filters) => {
                    const newFilters = [...filters]
                    const rangeFilter = filters.find((filter) => filter.type === "range")
                    if (rangeFilter) {
                        rangeFilter.value = JSON.stringify(value)
                    }
                    return newFilters
                })
                if (!relationList) {
                    setState(`collection-range-${labels.collection.toLowerCase()}`, "range", JSON.stringify(value))
                }
                expandCache(collection, value, preloadRange, setPreloadRange)
            })
        },
        [preloadRange, rangeFilter, rangeSelector, isInitialized, currentField],
    )

    const customization = getCollectionConfigModule(labels.collection)

    const disabled =
        isRouteLoading.has(location.pathname) ||
        (isPreloadCacheEnabled && !preloadRange) ||
        connectionStatus === "offline" ||
        tryFunction(customization.admin?.disableRangeSelector)
    const preventChange = isRouteLoadingImmediate.has(location.pathname)

    const Today = useCallback(() => {
        return (
            rangeFilter && (
                <Button
                    variant="outline"
                    onClick={() => {
                        if (preventChange) return
                        if (rangeSelector === "week") {
                            handleSelect({
                                from: DateTime.now().startOf("week").toJSDate(),
                                to: DateTime.now().endOf("week").toJSDate(),
                            })
                            setMonth(DateTime.now().startOf("week").toJSDate())
                        } else if (rangeSelector === "month") {
                            handleSelect({
                                from: DateTime.now().startOf("month").toJSDate(),
                                to: DateTime.now().endOf("month").toJSDate(),
                            })
                            setMonth(DateTime.now().startOf("month").toJSDate())
                        } else {
                            handleSelect({
                                from: DateTime.now().startOf("day").toJSDate(),
                                to: DateTime.now().endOf("day").toJSDate(),
                            })
                            setMonth(DateTime.now().startOf("day").toJSDate())
                        }
                    }}
                    disabled={disabled}
                >
                    Today
                </Button>
            )
        )
    }, [rangeFilter, rangeSelector, disabled, preventChange])

    const preloadCacheRangeSelector =
        tryFunction(customization.admin?.rangeSelectorValues) || preloadCache?.range?.selector

    const RangeSelector = useCallback(() => {
        const rangeSelectorValues = isPreloadCacheEnabled ? preloadCacheRangeSelector : rangeFilter?.selector
        if (!Array.isArray(rangeSelectorValues)) return null
        return (
            <Tabs value={rangeSelector}>
                <TabsList>
                    {rangeSelectorValues.map((selector) => (
                        <TabsTrigger key={selector} value={selector} onClick={() => setRangeSelector(selector)}>
                            {selector === "range" ? "Custom" : selector.charAt(0).toUpperCase() + selector.slice(1)}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
        )
    }, [rangeFilter, rangeSelector, isPreloadCacheEnabled])

    useEffect(() => {
        if (!isInitialized || !rangeFilter) return
        if (rangeSelector === "week") {
            handleSelect({
                from: DateTime.now().startOf("week").toJSDate(),
                to: DateTime.now().endOf("week").toJSDate(),
            })
            setMonth(DateTime.now().startOf("week").toJSDate())
        } else if (rangeSelector === "month") {
            handleSelect({
                from: DateTime.now().startOf("month").toJSDate(),
                to: DateTime.now().endOf("month").toJSDate(),
            })
            setMonth(DateTime.now().startOf("month").toJSDate())
        }
    }, [rangeSelector])

    if (!rangeFilter) return null

    const rangeSelectorValues = isPreloadCacheEnabled ? preloadCacheRangeSelector : rangeFilter?.selector

    return (
        <div className={cn("grid gap-2", className)}>
            <div className="flex items-center gap-1">
                {!relationList && (rangeSelector === "month" || rangeSelector === "week") && (
                    <Button
                        variant="outline"
                        onClick={() => {
                            if (preventChange) return
                            if (!range?.from) return
                            if (rangeSelector === "week")
                                handleSelect(DateTime.fromJSDate(range.from).minus({ weeks: 1 }).toJSDate())
                            if (rangeSelector === "month")
                                handleSelect(DateTime.fromJSDate(range.from).minus({ months: 1 }).toJSDate())
                        }}
                        disabled={disabled}
                        className="date-range-arrow hidden sm:block lg:hidden xl:block"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                )}
                <Popover>
                    <PopoverTrigger asChild disabled={disabled}>
                        <Button
                            id="date"
                            variant="outline"
                            className={cn(
                                relationList ? "w-[220px]" : "w-[300px]",
                                "justify-center text-left font-normal text-sm",
                                !range && "text-muted-foreground",
                            )}
                        >
                            {range && (
                                <>
                                    <CalendarIcon className="w-4 h-4 mr-1" />
                                    {!relationList ? (
                                        range?.from ? (
                                            range.to ? (
                                                <>
                                                    {DateTime.fromJSDate(range.from).toFormat("LLL dd, y")} -{" "}
                                                    {DateTime.fromJSDate(range.to).toFormat("LLL dd, y")}
                                                </>
                                            ) : (
                                                DateTime.fromJSDate(range.from).toFormat("LLL dd, y")
                                            )
                                        ) : (
                                            <span>Pick a date</span>
                                        )
                                    ) : (
                                        <span>Change date range</span>
                                    )}
                                </>
                            )}
                            {preloadCache?.range && currentField && currentField !== preloadCache.range.fields[0] && (
                                <span className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 block h-3 w-3 rounded-full bg-destructive"></span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" side="bottom" avoidCollisions={false}>
                        {rangeSelector === "week" ? (
                            <>
                                <div className="flex flex-col items-center mt-2 mb-2">
                                    {Array.isArray(rangeSelectorValues) && <RangeSelector />}
                                    {isPreloadCacheEnabled &&
                                        preloadCache?.range &&
                                        preloadCache.range.fields.length > 1 && (
                                            <div className="p-3 max-w-[300px] mx-auto">
                                                <CachePicker collection={collection} relationList={!!relationList} />
                                            </div>
                                        )}
                                </div>
                                <Calendar
                                    initialFocus
                                    mode="single"
                                    defaultMonth={range?.from}
                                    selected={range?.from}
                                    onSelect={(date: Date | undefined) => {
                                        if (preventChange) return
                                        handleSelect(date)
                                    }}
                                    numberOfMonths={window.innerWidth > 768 ? 2 : 1}
                                    disabled={disabled || { dayOfWeek: [0, 2, 3, 4, 5, 6] }}
                                    weekStartsOn={1}
                                    month={month}
                                    onMonthChange={setMonth}
                                />
                                <div className="flex justify-between mx-3 mb-2">
                                    <Today />
                                </div>
                            </>
                        ) : rangeSelector === "month" ? (
                            <>
                                {range?.from && (
                                    <div className="flex flex-col items-center mb-2">
                                        <div className="flex flex-col items-center mt-2 mb-2">
                                            {Array.isArray(rangeSelectorValues) && <RangeSelector />}
                                            {isPreloadCacheEnabled &&
                                                preloadCache?.range &&
                                                preloadCache.range.fields.length > 1 && (
                                                    <div className="p-3 max-w-[300px] mx-auto">
                                                        <CachePicker
                                                            collection={collection}
                                                            relationList={!!relationList}
                                                        />
                                                    </div>
                                                )}
                                        </div>
                                        <MonthPicker
                                            currentMonth={range.from}
                                            onMonthChange={(date: Date | undefined) => {
                                                if (preventChange) return
                                                handleSelect(date)
                                            }}
                                            disabled={disabled}
                                        />
                                        <Today />
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="flex flex-col items-center mt-2 mb-2">
                                    {Array.isArray(rangeSelectorValues) && <RangeSelector />}
                                    {isPreloadCacheEnabled &&
                                        preloadCache?.range &&
                                        preloadCache.range.fields.length > 1 && (
                                            <div className="p-3 max-w-[300px] mx-auto">
                                                <CachePicker collection={collection} relationList={!!relationList} />
                                            </div>
                                        )}
                                </div>
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={range?.from}
                                    selected={range}
                                    onSelect={(date: DateRange | undefined) => {
                                        if (preventChange) return
                                        handleSelect(date)
                                    }}
                                    numberOfMonths={window.innerWidth > 768 ? 2 : 1}
                                    disabled={disabled}
                                    weekStartsOn={1}
                                    month={month}
                                    onMonthChange={setMonth}
                                />
                                <div className="flex justify-between mx-3 mb-2">
                                    <Button variant="outline" onClick={() => setRange(undefined)}>
                                        Reset
                                    </Button>
                                    <Today />
                                </div>
                            </>
                        )}
                    </PopoverContent>
                </Popover>
                {!relationList && (rangeSelector === "month" || rangeSelector === "week") && (
                    <Button
                        variant="outline"
                        onClick={() => {
                            if (preventChange) return
                            if (!range?.from) return
                            if (rangeSelector === "week")
                                handleSelect(DateTime.fromJSDate(range.from).plus({ weeks: 1 }).toJSDate())
                            if (rangeSelector === "month")
                                handleSelect(DateTime.fromJSDate(range.from).plus({ months: 1 }).toJSDate())
                        }}
                        disabled={disabled}
                        className="date-range-arrow hidden sm:block lg:hidden xl:block"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}

import { CollectionSchema, RangeFilter } from "@stoker-platform/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { useCache } from "./providers/CacheProvider"
import { useRouteLoading } from "./providers/LoadingProvider"
import { useFilters } from "./providers/FiltersProvider"
import { useStokerState } from "./providers/StateProvider"
import { expandCache } from "./utils/expandCache"
import { startTransition } from "react"
import { getCurrentUserPermissions } from "@stoker-platform/web-client"

interface CachePickerProps {
    collection: CollectionSchema
    className?: string
    relationList?: boolean
}

export function CachePicker({ collection, className, relationList }: CachePickerProps) {
    const { labels, preloadCache } = collection
    const { setFilters } = useFilters()
    const [, setState] = useStokerState()
    const {
        currentField: currentFieldAll,
        setCurrentField,
        preloadRange: preloadRangeAll,
        setPreloadRange,
    } = useCache()
    const currentField = currentFieldAll[labels.collection]
    const preloadRange = preloadRangeAll?.[labels.collection]
    const { isRouteLoading, isRouteLoadingImmediate } = useRouteLoading()
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    if (!preloadCache?.range) return

    const disabled = isRouteLoading.has(location.pathname) || !preloadRange
    const preventChange = isRouteLoadingImmediate.has(location.pathname)

    return (
        <div className={className}>
            <Select
                disabled={disabled}
                // eslint-disable-next-line security/detect-object-injection
                value={currentField}
                onValueChange={(value) => {
                    if (preventChange) return
                    if (!preloadCache.range) return
                    setCurrentField((prev) => {
                        return {
                            ...prev,
                            [labels.collection]: value,
                        }
                    })
                    let rangeFilter: RangeFilter | undefined
                    setFilters((filters) => {
                        const newFilters = [...filters]
                        rangeFilter = filters.find((filter) => filter.type === "range")
                        if (rangeFilter) {
                            rangeFilter.field = value
                        }
                        return newFilters
                    })
                    if (!relationList) {
                        setState(`collection-range-field-${labels.collection.toLowerCase()}`, "field", value)
                    }
                    startTransition(() => {
                        const newRange = rangeFilter?.value ? JSON.parse(rangeFilter.value) : undefined
                        expandCache(
                            collection,
                            { from: new Date(newRange.from), to: new Date(newRange.to) },
                            preloadRangeAll?.[labels.collection],
                            setPreloadRange,
                        )
                    })
                }}
            >
                <SelectTrigger className="w-full flex justify-between items-center">
                    <div className="flex-grow text-center">
                        <SelectValue />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {preloadCache.range.fields.map((value, index) => {
                        return (
                            <SelectItem key={value} value={value}>
                                {/* eslint-disable-next-line security/detect-object-injection */}
                                {preloadCache.range?.labels?.[index] || value}
                            </SelectItem>
                        )
                    })}
                </SelectContent>
            </Select>
        </div>
    )
}

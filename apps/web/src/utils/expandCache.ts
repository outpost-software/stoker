import { CollectionSchema } from "@stoker-platform/types"
import { DateRange } from "react-day-picker"
import cloneDeep from "lodash/cloneDeep.js"
import { getRange } from "@stoker-platform/utils"
import { getTimezone, preloadCollection } from "@stoker-platform/web-client"

export const expandCache = async (
    collection: CollectionSchema,
    newRange: DateRange,
    preloadRange: DateRange | undefined,
    setPreloadRange: React.Dispatch<
        React.SetStateAction<
            | {
                  [collection: string]: DateRange | undefined
              }
            | undefined
        >
    >,
    setIsExpandingCache?: React.Dispatch<React.SetStateAction<boolean>>,
    setIsRouteLoading?: (operation: "+" | "-", route: string, immediate?: boolean) => void,
) => {
    const { labels, preloadCache } = collection
    const timezone = getTimezone()

    if (
        preloadRange &&
        preloadRange.from &&
        preloadRange.to &&
        ((newRange.from && newRange.from.toISOString() < preloadRange.from.toISOString()) ||
            (newRange.to && newRange.to.toISOString() > preloadRange.to.toISOString()))
    ) {
        if (preloadCache?.range && newRange.from) {
            const preloadCacheRange = cloneDeep(preloadCache.range)
            const preloadCacheRangeDates = getRange(preloadCacheRange, timezone)
            if (preloadRange.from && newRange.from.toISOString() < preloadRange.from.toISOString()) {
                preloadCacheRange.start = newRange.from
            } else {
                preloadCacheRange.start = preloadRange.from as Date
            }
            if (preloadRange.to && newRange.to && newRange.to.toISOString() > preloadRange.to.toISOString()) {
                preloadCacheRange.end = newRange.to
            } else if (preloadCacheRangeDates.end) {
                preloadCacheRange.end = preloadRange.to as Date
            }
            setIsExpandingCache?.(true)
            setIsRouteLoading?.("+", location.pathname, true)
            try {
                await preloadCollection(labels.collection, undefined, preloadCacheRange)
                setPreloadRange((prev) => {
                    return {
                        ...prev,
                        [labels.collection]: {
                            from: preloadCacheRange.start as Date,
                            to: preloadCacheRange.end as Date,
                        },
                    }
                })
            } finally {
                setIsExpandingCache?.(false)
                setIsRouteLoading?.("-", location.pathname)
            }
        }
    }
}

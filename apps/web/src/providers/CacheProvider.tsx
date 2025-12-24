import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { DateRange } from "react-day-picker"
import {
    CalendarConfig,
    PreloadCacheInitial,
    PreloadCacheRange,
    StokerCollection,
    StokerRole,
} from "@stoker-platform/types"
import {
    getCachedConfigValue,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getSchema,
    getTimezone,
    preloadCache,
} from "@stoker-platform/web-client"
import { getRange } from "@stoker-platform/utils"
import { DateTime } from "luxon"
import cloneDeep from "lodash/cloneDeep.js"
import { Unsubscribe, WhereFilterOp } from "firebase/firestore"
import { useStokerState } from "./StateProvider"

export const CacheContext = createContext<
    | {
          currentField: { [key: StokerCollection]: string | undefined }
          setCurrentField: React.Dispatch<React.SetStateAction<{ [key: StokerCollection]: string | undefined }>>
          preloadRange: { [key: StokerCollection]: DateRange | undefined } | undefined
          setPreloadRange: React.Dispatch<
              React.SetStateAction<{ [key: StokerCollection]: DateRange | undefined } | undefined>
          >
          unsubscribe: () => void
      }
    | undefined
>(undefined)

interface CacheProviderProps {
    children: React.ReactNode
}

/* eslint-disable react/prop-types */
export const CacheProvider: React.FC<CacheProviderProps> = ({ children }) => {
    const schema = getSchema()
    const timezone = getTimezone()
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")

    const [state] = useStokerState()
    const [currentField, setCurrentField] = useState<{ [key: StokerCollection]: string | undefined }>({})
    const [preloadRange, setPreloadRange] = useState<
        | {
              [key: StokerCollection]: DateRange | undefined
          }
        | undefined
    >(undefined)
    const collectionListeners = useRef<{ [collection: string]: Unsubscribe[] }>({})

    useEffect(() => {
        const initialize = async () => {
            const preloadRanges: PreloadCacheInitial = {}

            for (const [collectionName, collection] of Object.entries(schema.collections)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (!collection.preloadCache?.roles.includes(permissions.Role!)) continue
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { range: _, ...rest } = collection.preloadCache
                // eslint-disable-next-line security/detect-object-injection
                preloadRanges[collectionName] = rest as {
                    roles: StokerRole[]
                    range?: PreloadCacheRange
                    constraints?: [string, WhereFilterOp, unknown][]
                    orQueries?: [string, WhereFilterOp, unknown][]
                }
                const customization = getCollectionConfigModule(collectionName)
                const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                    "collections",
                    collectionName,
                    "admin",
                ]
                const calendarConfig = (await getCachedConfigValue(customization, [
                    ...collectionAdminPath,
                    "calendar",
                ])) as CalendarConfig

                const preloadCacheConfig = collection.preloadCache
                const fieldState = state[`collection-range-field-${collectionName.toLowerCase()}`]
                let currentField = fieldState
                if (preloadCacheConfig?.range) {
                    currentField ||= preloadCacheConfig.range.fields[0]
                }
                setCurrentField((prev) => {
                    return {
                        ...prev,
                        [collectionName]: currentField,
                    }
                })
                const rangeState = state[`collection-range-${collectionName.toLowerCase()}`]
                let range = rangeState ? JSON.parse(rangeState) : undefined
                let calendar
                if (window.innerWidth >= 1280) {
                    calendar = state[`collection-calendar-large-date-${collectionName.toLowerCase()}`]
                } else {
                    calendar = state[`collection-calendar-small-date-${collectionName.toLowerCase()}`]
                }
                if (!calendar) {
                    calendar = DateTime.now().toISODate()
                }
                if (calendarConfig) {
                    const calendarStart = DateTime.fromISO(calendar)
                        .minus(calendarConfig?.dataStart || { months: 1 })
                        .toMillis()
                    const calendarEnd = DateTime.fromISO(calendar)
                        .plus(calendarConfig?.dataEnd || { months: 1 })
                        .toMillis()
                    if (!range) {
                        range = { from: new Date(calendarStart).toISOString(), to: new Date(calendarEnd).toISOString() }
                    } else {
                        const from = new Date(
                            Math.min(new Date(range.from).getTime(), calendar ? calendarStart : Infinity),
                        )
                        const to = new Date(Math.max(new Date(range.to).getTime(), calendar ? calendarEnd : -Infinity))
                        range = { from: from.toISOString(), to: to.toISOString() }
                    }
                }
                if (preloadCacheConfig?.range) {
                    const preloadCacheRangeClone = cloneDeep(preloadCacheConfig.range)
                    const preloadCacheRangeDates = getRange(preloadCacheRangeClone, timezone)
                    if (range && range.from < preloadCacheRangeDates.start.toISOString()) {
                        preloadCacheRangeClone.start = new Date(range.from)
                    } else {
                        preloadCacheRangeClone.start = preloadCacheRangeDates.start
                    }
                    if (range && preloadCacheRangeDates.end && range.to > preloadCacheRangeDates.end.toISOString()) {
                        preloadCacheRangeClone.end = new Date(range.to)
                    } else if (preloadCacheRangeDates.end) {
                        preloadCacheRangeClone.end = preloadCacheRangeDates.end
                    }
                    // eslint-disable-next-line security/detect-object-injection
                    preloadRanges[collectionName].range = preloadCacheRangeClone
                    setPreloadRange((prev) => {
                        return {
                            ...prev,
                            [collectionName]: {
                                from: preloadCacheRangeClone.start as Date,
                                to: preloadCacheRangeClone.end as Date,
                            },
                        }
                    })
                }
            }
            if (Object.keys(preloadRanges).length > 0) {
                const listeners = await preloadCache(preloadRanges)
                collectionListeners.current = listeners
            }
        }
        initialize()
    }, [])

    const unsubscribe = useCallback(() => {
        Object.values(collectionListeners.current).forEach((collectionListener) => {
            collectionListener.forEach((unsubscribe) => unsubscribe())
        })
    }, [collectionListeners])

    return (
        <CacheContext.Provider value={{ currentField, setCurrentField, preloadRange, setPreloadRange, unsubscribe }}>
            {children}
        </CacheContext.Provider>
    )
}

export const useCache = () => {
    const context = useContext(CacheContext)
    if (!context) {
        throw new Error("useCache must be used within a CacheProvider")
    }
    return context
}

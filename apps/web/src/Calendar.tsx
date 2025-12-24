import {
    CalendarConfig,
    CollectionMeta,
    CollectionSchema,
    Filter,
    RangeFilter,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import { Query } from "./Collection"
import {
    getCachedConfigValue,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getOne,
    getSchema,
    updateRecord,
    getTimezone,
    preloadCollection,
    subscribeMany,
    onStokerPermissionsChange,
} from "@stoker-platform/web-client"
import { useGoToRecord } from "./utils/goToRecord"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { ScrollArea } from "./components/ui/scroll-area"
import { useOptimistic } from "./providers/OptimisticProvider"
import { isServerUpdate } from "./utils/isServerWrite"
import { isOfflineDisabled as isOfflineDisabledSync } from "./utils/isOfflineDisabled"
import { canUpdateField, getField, getSystemFieldsSchema, isRelationField, tryFunction } from "@stoker-platform/utils"
import cloneDeep from "lodash/cloneDeep.js"
import { useGlobalLoading } from "./providers/LoadingProvider"
import { useToast } from "./hooks/use-toast"
import { QueryConstraint, Timestamp, where } from "firebase/firestore"
import { Table, TableBody, TableCell, TableRow } from "./components/ui/table"
import { Grip } from "lucide-react"
import { useDrag } from "react-dnd"

import {
    CalendarOptions,
    DatesSetArg,
    DateSelectArg,
    EventClickArg,
    EventDropArg,
    EventInput,
    ViewContentArg,
} from "@fullcalendar/core"
import FullCalendar from "@fullcalendar/react"
import interactionPlugin, {
    DateClickArg,
    EventReceiveArg,
    EventResizeDoneArg,
    ThirdPartyDraggable,
} from "@fullcalendar/interaction"
import dayGridPlugin from "@fullcalendar/daygrid"
import multiMonthPlugin from "@fullcalendar/multimonth"
import timeGridPlugin from "@fullcalendar/timegrid"
import timelinePlugin from "@fullcalendar/timeline"
import resourceDayGridPlugin from "@fullcalendar/resource-daygrid"
import resourceTimelinePlugin from "@fullcalendar/resource-timeline"
import resourceTimeGridPlugin from "@fullcalendar/resource-timegrid"
import listPlugin from "@fullcalendar/list"
import adaptivePlugin from "@fullcalendar/adaptive"
import luxonPlugin from "@fullcalendar/luxon3"
import { useStokerState } from "./providers/StateProvider"
import { useFilters } from "./providers/FiltersProvider"
import { getMaxDate, getMinDate } from "./utils/getMaxDateRange"
import { DateTime } from "luxon"
import { useCache } from "./providers/CacheProvider"
import { DateRange } from "react-day-picker"
import { isEqual } from "lodash"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { serverReadOnly } from "./utils/serverReadOnly"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { Helmet } from "react-helmet"
import { useConnection } from "./providers/ConnectionProvider"
import { SortingState } from "@tanstack/react-table"
import { cn } from "./lib/utils"

function Row({
    collection,
    record,
    recordTitleField,
    isDisabled,
}: {
    collection: CollectionSchema
    record: StokerRecord
    recordTitleField: string | undefined
    isDisabled: boolean
}) {
    const goToRecord = useGoToRecord()
    // eslint-disable-next-line security/detect-object-injection
    const title = recordTitleField ? record[recordTitleField] : record.id

    const [, drag] = useDrag(
        () => ({
            type: "unscheduled",
            item: { record },
            canDrag: () => !isDisabled,
        }),
        [isDisabled],
    )

    const eventData = { id: record.id, title }

    let className = "unscheduled cursor-pointer odd:bg-muted dark:odd:bg-primary-foreground dark:hover:bg-muted"
    if (isDisabled) {
        className += " disabled cursor-default"
    }

    return (
        <TableRow
            key={record.id}
            ref={drag}
            tabIndex={0}
            onClick={() => {
                goToRecord(collection, record)
            }}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    goToRecord(collection, record)
                }
            }}
            className={className}
            data-event={JSON.stringify(eventData)}
        >
            <TableCell id={record.id} className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[200px]">
                {!isDisabled && (
                    <Grip
                        id="unscheduled-grip"
                        className="inline h-3.5 w-3.5 mr-2 relative bottom-[1px] text-foreground/50 cursor-grab"
                    />
                )}
                {title}
            </TableCell>
        </TableRow>
    )
}

interface CalendarProps {
    collection: CollectionSchema
    list: StokerRecord[] | undefined
    setList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    setServerList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    getData: (query: Query, direction?: "next" | "prev") => Promise<void>
    unsubscribe: React.MutableRefObject<{ [key: string | number]: ((direction?: "first" | "last") => void)[] }>
    setOptimisticList: () => void
    canAddRecords: boolean
    onDateSelection?: (dateSelectionData: { startDate: Date; endDate?: Date }) => void
    backToStartKey: number
    relationList?: boolean
    formList?: boolean
}

export function Calendar({
    collection,
    list,
    setList,
    setServerList,
    getData,
    unsubscribe,
    setOptimisticList,
    canAddRecords,
    onDateSelection,
    backToStartKey,
    relationList,
    formList,
}: CalendarProps) {
    const { labels, access, fields, recordTitleField, preloadCache } = collection
    const { serverWriteOnly } = access
    const timezone = getTimezone()
    const schema = getSchema(true)
    const customization = getCollectionConfigModule(labels.collection)
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    const goToRecord = useGoToRecord()
    const { toast } = useToast()
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

    const [recordTitle, setRecordTitle] = useState<string | undefined>(undefined)
    const [collectionTitle, setCollectionTitle] = useState<string | undefined>(undefined)
    const [meta, setMeta] = useState<CollectionMeta | undefined>(undefined)
    const [calendarConfig, setCalendarConfig] = useState<CalendarConfig | undefined>(undefined)
    const [isOfflineCreateDisabled, setIsOfflineCreateDisabled] = useState<boolean | undefined>(undefined)
    const [isOfflineUpdateDisabled, setIsOfflineUpdateDisabled] = useState<boolean | undefined>(undefined)

    const { optimisticUpdates, removeOptimisticUpdate, setOptimisticUpdate, removeCacheOptimistic } = useOptimistic()
    const { isGlobalLoading, setGlobalLoading } = useGlobalLoading()
    const [isInitialized, setIsInitialized] = useState(false)

    const [hasStartUpdateAccess, setHasStartUpdateAccess] = useState<boolean>(false)
    const [hasEndUpdateAccess, setHasEndUpdateAccess] = useState<boolean>(false)
    const [hasReourceUpdateAccess, setHasReourceUpdateAccess] = useState<boolean>(false)

    const [currentViewLarge, setCurrentViewLarge] = useState<string | undefined>(undefined)
    const [currentViewSmall, setCurrentViewSmall] = useState<string | undefined>(undefined)
    const [currentDateLarge, setCurrentDateLarge] = useState<Date>(new Date())
    const [currentDateSmall, setCurrentDateSmall] = useState<Date>(new Date())
    const [resources, setResources] = useState<Set<{ id: string; title: string; Collection_Path?: string }>>(new Set())
    const [unscheduledRecords, setUnscheduledRecords] = useState<StokerRecord[]>([])
    const [unscheduledLoading, setUnscheduledLoading] = useState<boolean>(true)

    const { filters, getFilterConstraints } = useFilters()
    const [rangeFilter, setRangeFilter] = useState<RangeFilter | undefined>(undefined)
    const { currentField: currentFieldAll, preloadRange: preloadRangeAll, setPreloadRange } = useCache()
    const currentField = currentFieldAll?.[labels.collection]
    const preloadRange = preloadRangeAll?.[labels.collection]
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)

    const constraintsWithoutRangeFilter = useCallback(
        (allFilters: Filter[]) => {
            const newFilters = cloneDeep(allFilters)
            const rangeIndex = newFilters.findIndex((filter) => filter.type === "range")
            if (rangeIndex !== -1) {
                newFilters.splice(rangeIndex, 1)
            }
            return getFilterConstraints(newFilters)
        },
        [rangeFilter, calendarConfig],
    )

    const constraintsWithCacheFilter = useCallback(
        (allFilters: Filter[], startField: string) => {
            const newFilters = cloneDeep(allFilters)
            const rangeIndex = newFilters.findIndex((filter) => filter.type === "range")
            if (rangeIndex !== -1) {
                newFilters.splice(rangeIndex, 1)
            }
            newFilters.push({
                type: "range" as const,
                field: startField,
                value: JSON.stringify({ from: getMinDate(), to: getMaxDate() }),
            })
            return getFilterConstraints(newFilters)
        },
        [rangeFilter, calendarConfig],
    )

    const constraintsWithCalendarRangeFilter = useCallback(
        (allFilters: Filter[], rangeFilterValue?: RangeFilter) => {
            const latestRangeFilter = rangeFilterValue || rangeFilter
            const newFilters = cloneDeep(allFilters)
            const rangeIndex = newFilters.findIndex((filter) => filter.type === "range")
            if (rangeIndex !== -1) {
                newFilters.splice(rangeIndex, 1)
            }
            if (latestRangeFilter) {
                newFilters.push(latestRangeFilter)
            }
            return getFilterConstraints(newFilters)
        },
        [rangeFilter],
    )

    const reload = useCallback(() => {
        if (isInitialized && !(isPreloadCacheEnabled && !calendarConfig)) {
            getData({
                infinite: false,
                queries: [
                    {
                        constraints: !isPreloadCacheEnabled
                            ? constraintsWithCalendarRangeFilter(filters)
                            : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                              constraintsWithCacheFilter(filters, calendarConfig!.startField),
                        options: {
                            pagination: {
                                orderByField: `${recordTitleField}_Lowercase`,
                                orderByDirection: "asc",
                            },
                        },
                    },
                ],
            })
        }
    }, [isInitialized, isPreloadCacheEnabled, calendarConfig, filters, recordTitleField])

    useEffect(() => {
        reload()
    }, [filters, rangeFilter])

    useEffect(() => {
        if (!isInitialized) return
        reload()
    }, [backToStartKey])

    const originalPermissions = useRef<StokerPermissions | null>(cloneDeep(permissions))

    const reloadRef = useRef(reload)

    useEffect(() => {
        reloadRef.current = reload
    }, [reload])

    useEffect(() => {
        reload()

        const unsubscribePermissions = onStokerPermissionsChange(() => {
            const latestPermissions = getCurrentUserPermissions()
            if (
                !isEqual(
                    latestPermissions?.collections?.[labels.collection],
                    originalPermissions.current?.collections?.[labels.collection],
                )
            ) {
                reloadRef.current()
                originalPermissions.current = cloneDeep(latestPermissions)
            }
        })
        return unsubscribePermissions
    }, [])

    useEffect(() => {
        const largeViewState = state[`collection-calendar-large-${labels.collection.toLowerCase()}`]
        const smallViewState = state[`collection-calendar-small-${labels.collection.toLowerCase()}`]
        const largeDate = state[`collection-calendar-large-date-${labels.collection.toLowerCase()}`]
        const smallDate = state[`collection-calendar-small-date-${labels.collection.toLowerCase()}`]
        if (!relationList) {
            if (largeViewState) {
                setCurrentViewLarge(largeViewState)
            } else {
                setCurrentViewLarge("dayGridMonth")
            }
            if (smallViewState) {
                setCurrentViewSmall(smallViewState)
            } else {
                setCurrentViewSmall("listMonth")
            }
            if (largeDate) {
                setCurrentDateLarge(new Date(largeDate))
                setState(
                    `collection-calendar-large-date-${labels.collection.toLowerCase()}`,
                    "calendar-large-date",
                    largeDate,
                )
            }
            if (smallDate) {
                setCurrentDateSmall(new Date(smallDate))
                setState(
                    `collection-calendar-small-date-${labels.collection.toLowerCase()}`,
                    "calendar-small-date",
                    smallDate,
                )
            }
        } else {
            setCurrentViewLarge("dayGridMonth")
            setCurrentViewSmall("listMonth")
        }

        const initialize = async () => {
            const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                "collections",
                labels.collection,
                "admin",
            ]
            const offlineCreateDisabled = await getCachedConfigValue(customization, [
                "collections",
                labels.collection,
                "custom",
                "disableOfflineCreate",
            ])
            setIsOfflineCreateDisabled(offlineCreateDisabled)
            const offlineUpdateDisabled = await getCachedConfigValue(customization, [
                "collections",
                labels.collection,
                "custom",
                "disableOfflineUpdate",
            ])
            setIsOfflineUpdateDisabled(offlineUpdateDisabled)
            const recordTitle = await getCachedConfigValue(customization, [...collectionAdminPath, "titles", "record"])
            setRecordTitle(recordTitle || labels.record)
            const calendarConfig = (await getCachedConfigValue(customization, [
                ...collectionAdminPath,
                "calendar",
            ])) as CalendarConfig
            setCalendarConfig(calendarConfig)
            const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
            setCollectionTitle(titles?.collection)
            const meta = await getCachedConfigValue(customization, [...collectionAdminPath, "meta"])
            setMeta(meta)
            const originalRangeFilter = filters.find((filter) => filter.type === "range")
            let from: Date, to: Date
            const startDate =
                window.innerWidth >= 1280
                    ? largeDate || new Date().toISOString()
                    : smallDate || new Date().toISOString()
            let rangeFilterValue: RangeFilter | undefined
            if (!isPreloadCacheEnabled) {
                if (calendarConfig?.dataStart) {
                    from = DateTime.fromJSDate(new Date(startDate)).minus(calendarConfig.dataStart).toJSDate()
                } else {
                    from = getMinDate()
                }
                if (calendarConfig?.dataEnd) {
                    to = DateTime.fromJSDate(new Date(startDate)).plus(calendarConfig.dataEnd).toJSDate()
                } else {
                    to = getMaxDate()
                }
                rangeFilterValue = {
                    type: "range" as const,
                    field: originalRangeFilter?.field || calendarConfig?.startField,
                    value: JSON.stringify({ from, to }),
                }
                setRangeFilter(rangeFilterValue)
            }

            const systemFields = getSystemFieldsSchema()
            const allFields = fields.concat(systemFields)

            const startField = calendarConfig?.startField
            const startFieldSchema = getField(allFields, startField)
            const endField = calendarConfig?.endField
            const endFieldSchema = getField(allFields, endField)
            const resourceField = calendarConfig?.resourceField
            const resourceFieldSchema = getField(allFields, resourceField)
            const allDayField = calendarConfig?.allDayField
            const allDayFieldSchema = getField(allFields, allDayField)

            const hasStartUpdateAccess = !!(
                canUpdateField(collection, startFieldSchema, permissions) &&
                !systemFields.map((field) => field.name).includes(startField)
            )
            const hasAllDayUpdateAccess =
                allDayFieldSchema && !!canUpdateField(collection, allDayFieldSchema, permissions)
            setHasStartUpdateAccess(hasStartUpdateAccess && (!allDayField || hasAllDayUpdateAccess))
            if (endField) {
                const hasEndUpdateAccess = !!(
                    canUpdateField(collection, endFieldSchema, permissions) &&
                    !systemFields.map((field) => field.name).includes(endField)
                )
                setHasEndUpdateAccess(hasEndUpdateAccess && (!allDayField || hasAllDayUpdateAccess))
            }
            if (resourceField) {
                const hasReourceUpdateAccess = !!canUpdateField(collection, resourceFieldSchema, permissions)
                setHasReourceUpdateAccess(hasReourceUpdateAccess)
            }

            setList({})
            setServerList({})
            if (unsubscribe.current) {
                Object.values(unsubscribe.current).forEach((unsubscribe) =>
                    unsubscribe.forEach((unsubscribe) => unsubscribe()),
                )
            }

            getData({
                infinite: false,
                queries: [
                    {
                        constraints: !isPreloadCacheEnabled
                            ? constraintsWithCalendarRangeFilter(filters)
                            : constraintsWithCacheFilter(filters, calendarConfig.startField),
                        options: {
                            pagination: {
                                orderByField: `${recordTitleField}_Lowercase`,
                                orderByDirection: "asc",
                            },
                        },
                    },
                ],
            }).then(() => {
                setIsInitialized(true)
            })
        }
        initialize()
    }, [])

    useEffect(() => {
        let unscheduledListener: (() => void) | undefined
        if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
        if (
            !relationList &&
            isPreloadCacheEnabled &&
            calendarConfig?.unscheduled &&
            (!calendarConfig?.unscheduled.roles || calendarConfig?.unscheduled.roles.includes(permissions.Role))
        ) {
            const subscribe = async () => {
                const constraints = constraintsWithoutRangeFilter(filters)
                // TODO: subcollection support
                const result = await subscribeMany(
                    [labels.collection],
                    [...(constraints as QueryConstraint[]), where(calendarConfig.startField, "==", null)],
                    (docs) => {
                        docs.sort((a, b) => {
                            // eslint-disable-next-line security/detect-object-injection
                            const titleA = a[recordTitleField]?.toLowerCase() || ""
                            // eslint-disable-next-line security/detect-object-injection
                            const titleB = b[recordTitleField]?.toLowerCase() || ""
                            if (titleA < titleB) return -1
                            if (titleA > titleB) return 1
                            return 0
                        })
                        setUnscheduledRecords(docs)
                        setUnscheduledLoading((prev) => (prev ? false : prev))
                    },
                    (error) => {
                        console.error(error)
                    },
                    {
                        pagination: {
                            number: 250,
                        },
                    },
                )
                unscheduledListener = result.unsubscribe
            }
            subscribe()
        }
        return () => {
            if (unscheduledListener) {
                unscheduledListener()
            }
        }
    }, [calendarConfig, filters])

    const plugins = useMemo(
        () => [
            interactionPlugin,
            dayGridPlugin,
            timeGridPlugin,
            multiMonthPlugin,
            timelinePlugin,
            resourceDayGridPlugin,
            resourceTimelinePlugin,
            resourceTimeGridPlugin,
            listPlugin,
            adaptivePlugin,
            luxonPlugin,
        ],
        [],
    )

    /* eslint-disable security/detect-object-injection */
    const getResource = useCallback(
        (
            collection: StokerCollection,
            record: StokerRecord,
            resourceField: string,
        ): { id: string; title: string; Collection_Path?: string } | undefined => {
            const fields = schema.collections[collection].fields
            const field = getField(fields, resourceField)
            switch (field.type) {
                case "Boolean": {
                    const boolean = record[resourceField] ? resourceField : `Not ${resourceField}`
                    return { id: boolean, title: boolean }
                }
                case "String": {
                    const string = record[resourceField]
                    return { id: string, title: string }
                }
                case "Number": {
                    const number = record[resourceField].toString()
                    return { id: number, title: number }
                }
                case "Timestamp": {
                    const value = record[resourceField].toDate().toISOString()
                    return { id: value, title: value }
                }
                case "OneToOne": {
                    if (calendarConfig?.resourceTitleField) {
                        const value = Object.entries(record[resourceField])[0] as [string, Record<string, unknown>]
                        return {
                            id: value[0],
                            title: getResource(
                                field.collection,
                                value[1] as StokerRecord,
                                calendarConfig.resourceTitleField,
                            )?.title as string,
                            Collection_Path: value[1].Collection_Path as string,
                        }
                    }
                    break
                }
                case "OneToMany": {
                    if (calendarConfig?.resourceTitleField) {
                        const value = Object.entries(record[resourceField])[0] as [string, Record<string, unknown>]
                        return {
                            id: value[0],
                            title: getResource(
                                field.collection,
                                value[1] as StokerRecord,
                                calendarConfig.resourceTitleField,
                            )?.title as string,
                            Collection_Path: value[1].Collection_Path as string,
                        }
                    }
                    break
                }
                case "Computed": {
                    const value = record[resourceField]
                    return { id: value, title: value }
                }
            }
            return
        },
        [calendarConfig],
    )
    /* eslint-enable security/detect-object-injection */

    const isUpdateDisabled = connectionStatus === "offline" && (isOfflineUpdateDisabled || serverWriteOnly)

    const events: EventInput[] = useMemo(() => {
        if (!calendarConfig || !recordTitleField || !permissions || !list) return []
        const collectionOptimisticUpdates = optimisticUpdates?.get(labels.collection)
        const updatedList = cloneDeep(list)
        collectionOptimisticUpdates?.forEach((optimisticRecord) => {
            const index = updatedList.findIndex((record) => record.id === optimisticRecord.id)
            if (index !== -1) {
                // eslint-disable-next-line security/detect-object-injection
                updatedList[index] = optimisticRecord
            } else {
                updatedList.push(optimisticRecord)
            }
        })
        return updatedList
            .filter((record) => record[calendarConfig.startField])
            .map((record) => {
                const isPendingServer = isGlobalLoading.get(record.id)?.server

                const event: EventInput = {
                    id: record.id,
                    // eslint-disable-next-line security/detect-object-injection
                    title: record[recordTitleField] || record.id,
                    start: record[calendarConfig.startField].toDate(),
                    startEditable: !isPendingServer && !isUpdateDisabled && hasStartUpdateAccess,
                    durationEditable: !isPendingServer && !isUpdateDisabled && hasEndUpdateAccess,
                    resourceEditable: !isPendingServer && !isUpdateDisabled && hasReourceUpdateAccess,
                }
                if (calendarConfig.endField && record[calendarConfig.endField]) {
                    event.end = record[calendarConfig.endField].toDate()
                }
                if (calendarConfig.allDayField !== undefined) {
                    event.allDay = record[calendarConfig.allDayField]
                }
                if (calendarConfig.resourceField && record[calendarConfig.resourceField] !== undefined) {
                    const resource = getResource(labels.collection, record, calendarConfig.resourceField)
                    if (resource) {
                        event.resourceId = resource.id
                        setResources((resources) =>
                            new Set(resources).add({
                                id: resource.id as string,
                                title: resource.title as string,
                                Collection_Path: resource.Collection_Path,
                            }),
                        )
                    }
                }
                const color = tryFunction(calendarConfig.color, [record])
                if (color) {
                    event.color = color
                }
                return event
            })
    }, [
        calendarConfig,
        list,
        recordTitleField,
        isOfflineUpdateDisabled,
        serverWriteOnly,
        hasStartUpdateAccess,
        hasEndUpdateAccess,
        hasReourceUpdateAccess,
        isGlobalLoading,
    ])

    const updateEvent = useCallback(
        async (info: EventDropArg | EventResizeDoneArg | EventReceiveArg) => {
            if (!calendarConfig) return
            const record = list
                ?.concat(unscheduledRecords)
                ?.find((record) => record.id === info.event.id) as StokerRecord

            const updatedFields: Partial<StokerRecord> = {}
            if (calendarConfig.startField && info.event.start) {
                updatedFields[calendarConfig.startField] = Timestamp.fromDate(info.event.start)
            }
            if (calendarConfig.endField && info.event.start) {
                updatedFields[calendarConfig.endField] = Timestamp.fromDate(info.event.end || info.event.start)
            }
            if (calendarConfig.allDayField !== undefined) {
                updatedFields[calendarConfig.allDayField] = info.event.allDay
            }
            if (calendarConfig.resourceField && "newResource" in info && info.newResource) {
                const field = getField(fields, calendarConfig.resourceField)
                if (!isRelationField(field)) {
                    updatedFields[calendarConfig.resourceField] = info.newResource.title
                } else {
                    const relatedRecord = await getOne(
                        info.newResource.extendedProps.Collection_Path,
                        info.newResource.id,
                    )
                    updatedFields[calendarConfig.resourceField] = {
                        [info.newResource.id]: {
                            Collection_Path: relatedRecord.Collection_Path,
                        },
                    }
                    if (field.includeFields) {
                        for (const includeField of field.includeFields) {
                            // eslint-disable-next-line security/detect-object-injection
                            updatedFields[calendarConfig.resourceField][info.newResource.id][includeField] =
                                // eslint-disable-next-line security/detect-object-injection
                                relatedRecord[includeField]
                        }
                    }
                }
            }

            const offlineDisabled = await isOfflineDisabledSync("update", collection, record)
            if (offlineDisabled) {
                alert(`You are offline and cannot update this record.`)
                removeOptimisticUpdate(labels.collection, record.id)
                return
            }

            const serverWrite = isServerUpdate(collection, record)
            const isServerReadOnly = serverReadOnly(collection)

            const optimisticUpdate = {
                ...record,
                ...updatedFields,
            }
            setOptimisticUpdate(labels.collection, optimisticUpdate)

            const originalRecord = cloneDeep(record)
            setGlobalLoading("+", record.id, serverWrite, !(serverWrite || isServerReadOnly))
            updateRecord(record.Collection_Path, record.id, updatedFields, undefined, undefined, originalRecord)
                .then(() => {
                    if (serverWrite || isServerReadOnly) {
                        toast({
                            // eslint-disable-next-line security/detect-object-injection
                            description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} updated successfully.`,
                        })
                    }
                    removeOptimisticUpdate(labels.collection, record.id)
                })
                .catch((error) => {
                    console.error(error)
                    info.revert()
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} failed to update.`,
                        variant: "destructive",
                    })
                    removeOptimisticUpdate(labels.collection, record.id)
                    setOptimisticList()
                })
                .finally(() => {
                    setGlobalLoading("-", record.id, undefined, !(serverWrite || isServerReadOnly))
                })
            if (!serverWrite && !isServerReadOnly) {
                removeCacheOptimistic(collection, record)
                toast({
                    // eslint-disable-next-line security/detect-object-injection
                    description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} updated.`,
                })
            }
        },
        [calendarConfig, list, unscheduledRecords, recordTitleField, recordTitle],
    )

    const createEvent = useCallback(
        (dateInfo?: { start: Date; end?: Date }) => {
            if (onDateSelection && dateInfo) {
                onDateSelection({
                    startDate: dateInfo.start,
                    endDate: dateInfo.end,
                })
            }
        },
        [labels.collection, labels.record, onDateSelection],
    )

    const draggedRef = useRef<HTMLElement | null>(null)

    useEffect(() => {
        const dragMove = (event: MouseEvent | TouchEvent) => {
            event.preventDefault()
            let x, y
            if (event instanceof MouseEvent) {
                x = event.clientX
                y = event.clientY
            } else {
                x = event.touches[0].clientX
                y = event.touches[0].clientY
            }
            if (draggedRef.current) {
                const rect = draggedRef.current.getBoundingClientRect()
                const scrollY = window.scrollY
                draggedRef.current.style.left = `${x - rect.width / 2}px`
                draggedRef.current.style.top = `${y - rect.height / 2 + scrollY}px`
            }
        }

        const dragStart = function (event: DragEvent) {
            event.preventDefault()
            window.addEventListener("mousemove", dragMove, { passive: false })
            window.addEventListener("touchmove", dragMove, { passive: false })
        }
        window.addEventListener("dragstart", dragStart, false)

        const handleMouseDown = (event: MouseEvent | TouchEvent) => {
            let target = event.target as HTMLElement
            if (target.id === "unscheduled-grip") {
                target = target.parentElement as HTMLElement
            }
            const cell = document.getElementById(target.id)
            if (cell && !cell.parentElement?.classList.contains("disabled")) {
                const clonedCell = cell.cloneNode(true) as HTMLElement
                clonedCell.classList.add(
                    "absolute",
                    "w-[250px]",
                    "z-50",
                    "opacity-75",
                    "text-sm",
                    "border-none",
                    "bg-muted",
                )
                document.body.appendChild(clonedCell)
                draggedRef.current = clonedCell
            }
        }
        window.addEventListener("mousedown", handleMouseDown, false)
        window.addEventListener("touchstart", handleMouseDown, false)

        const handleMouseUp = () => {
            window.removeEventListener("mousemove", dragMove)
            window.removeEventListener("touchmove", dragMove)
            if (draggedRef.current) {
                draggedRef.current.remove()
            }
        }
        window.addEventListener("mouseup", handleMouseUp, false)
        window.addEventListener("touchend", handleMouseUp, false)

        const draggable = new ThirdPartyDraggable({
            itemSelector: ".unscheduled:not(.disabled)",
        })

        return () => {
            window.removeEventListener("dragstart", dragStart)
            window.removeEventListener("mousedown", handleMouseDown)
            window.removeEventListener("mouseup", handleMouseUp)
            window.removeEventListener("mousemove", dragMove)
            window.removeEventListener("touchmove", dragMove)
            window.removeEventListener("touchstart", handleMouseDown)
            window.removeEventListener("touchend", handleMouseUp)
            if (draggable) {
                draggable.destroy()
            }
            if (draggedRef.current) {
                draggedRef.current.remove()
            }
        }
    }, [])

    useEffect(() => {
        if (currentViewLarge) {
            setState(`collection-calendar-large-${labels.collection.toLowerCase()}`, "calendar-large", currentViewLarge)
        }
    }, [currentViewLarge])

    useEffect(() => {
        if (currentViewSmall) {
            setState(`collection-calendar-small-${labels.collection.toLowerCase()}`, "calendar-small", currentViewSmall)
        }
    }, [currentViewSmall])

    const handleDateChange = useCallback(
        (date: Date) => {
            if (!isInitialized || (isPreloadCacheEnabled && !preloadRange)) return
            const datetime = DateTime.fromJSDate(date)
            const newRange = {} as DateRange
            if (currentField && preloadCache?.range) {
                if (preloadRange?.from && preloadRange?.to) {
                    const preloadCacheRange = cloneDeep(preloadCache.range)
                    if (
                        datetime
                            .minus(calendarConfig?.dataStartOffset || { months: 1 })
                            .diff(DateTime.fromJSDate(preloadRange?.from)).milliseconds < 0
                    ) {
                        preloadCacheRange.start = datetime.minus(calendarConfig?.dataStart || { months: 1 }).toJSDate()
                    } else {
                        preloadCacheRange.start = preloadRange?.from
                    }
                    if (
                        datetime
                            .plus(calendarConfig?.dataEndOffset || { months: 1 })
                            .diff(DateTime.fromJSDate(preloadRange?.to)).milliseconds > 0
                    ) {
                        preloadCacheRange.end = datetime.plus(calendarConfig?.dataEnd || { months: 1 }).toJSDate()
                    } else {
                        preloadCacheRange.end = preloadRange?.to
                    }
                    newRange.from = preloadCacheRange.start
                    newRange.to = preloadCacheRange.end
                    if (!isEqual(newRange, preloadRange)) {
                        preloadCollection(labels.collection, undefined, preloadCacheRange)
                        setPreloadRange((prev) => {
                            return {
                                ...prev,
                                [labels.collection]: newRange,
                            }
                        })
                    }
                }
            } else {
                if (!calendarConfig || !rangeFilter?.value) return
                const range = JSON.parse(rangeFilter.value)
                if (!range.from || !range.to) return
                if (
                    calendarConfig.dataStart &&
                    calendarConfig.dataEnd &&
                    (datetime.minus(calendarConfig?.dataStartOffset || { months: 1 }).diff(DateTime.fromISO(range.from))
                        .milliseconds < 0 ||
                        datetime.plus(calendarConfig?.dataEndOffset || { months: 1 }).diff(DateTime.fromISO(range.to))
                            .milliseconds > 0)
                ) {
                    newRange.from = datetime.minus(calendarConfig.dataStart).toJSDate()
                    newRange.to = datetime.plus(calendarConfig.dataEnd).toJSDate()
                    if (!isEqual(JSON.stringify(newRange), JSON.stringify(range))) {
                        const rangeFilterValue = {
                            type: "range" as const,
                            field: rangeFilter.field || calendarConfig.startField,
                            value: JSON.stringify(newRange),
                        }
                        setRangeFilter(rangeFilterValue)
                    }
                }
            }
        },
        [calendarConfig, rangeFilter, preloadCache, currentField, preloadRange, isInitialized, isPreloadCacheEnabled],
    )

    if (!calendarConfig || !permissions || (isPreloadCacheEnabled && preloadCache?.range && !currentField)) return null

    const isCreateDisabled = connectionStatus === "offline" && (isOfflineCreateDisabled || serverWriteOnly)

    const calendarProps: CalendarOptions = {
        timeZone: timezone || "UTC",
        firstDay: 1,
        plugins,
        events,
        resources: Array.from(resources),
        selectable: canAddRecords && !isCreateDisabled && !!calendarConfig?.endField,
        droppable: hasStartUpdateAccess,
        eventClick(info: EventClickArg) {
            const record = list?.find((record) => record.id === info.event.id) as StokerRecord
            goToRecord(collection, record)
        },
        eventDrop(info: EventDropArg) {
            updateEvent(info)
        },
        eventResize(info: EventResizeDoneArg) {
            updateEvent(info)
        },
        eventReceive(info: EventReceiveArg) {
            updateEvent(info)
        },
        dateClick(info: DateClickArg) {
            createEvent({ start: info.date })
        },
        select(info: DateSelectArg) {
            createEvent({ start: info.start, end: info.end })
        },
        eventInteractive: true,
        height: "auto",
        buttonText: {
            today: "Today",
            year: "Year",
            month: "Month",
            week: "Week",
            day: "Day",
        },
        multiMonthMaxColumns: 2,
        dayMaxEventRows: 10,
        resourceOrder: "title",
    }

    return (
        <>
            {!formList && (
                <Helmet>
                    <title>{`${meta?.title || collectionTitle || labels.collection} - Calendar`}</title>
                    {meta?.description && <meta name="description" content={meta.description} />}
                </Helmet>
            )}
            <div className="flex gap-4 select-none">
                <Card className="flex-1">
                    <ScrollArea
                        className={cn(
                            "hidden sm:block h-[calc(100vh-188px)] print:h-full",
                            relationList && "h-[calc(100vh-304px)]",
                        )}
                    >
                        <CardContent className="p-4 h-full">
                            {currentViewLarge && (
                                <FullCalendar
                                    schedulerLicenseKey={import.meta.env.STOKER_FULLCALENDAR_KEY}
                                    initialDate={currentDateLarge}
                                    initialView={currentViewLarge}
                                    headerToolbar={{
                                        start: "title",
                                        center: "",
                                        end: "today dayGridWeek,dayGridMonth,multiMonthYear prev,next",
                                    }}
                                    {...calendarProps}
                                    viewClassNames={(arg: ViewContentArg) => {
                                        setCurrentViewLarge(arg.view.type)
                                        return []
                                    }}
                                    datesSet={(arg: DatesSetArg) => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const date = (arg.view as any).getCurrentData().calendarApi.getDate()
                                        handleDateChange(date)
                                        setState(
                                            `collection-calendar-large-date-${labels.collection.toLowerCase()}`,
                                            "calendar-large-date",
                                            date.toISOString(),
                                        )
                                    }}
                                    {...calendarConfig.fullCalendarLarge}
                                />
                            )}
                        </CardContent>
                    </ScrollArea>
                    <ScrollArea className="sm:hidden min-h-screen print:h-full">
                        <CardContent className="p-4 h-full">
                            {currentViewSmall && (
                                <FullCalendar
                                    schedulerLicenseKey={import.meta.env.STOKER_FULLCALENDAR_KEY}
                                    initialDate={currentDateSmall}
                                    initialView={currentViewSmall}
                                    headerToolbar={{
                                        start: "title",
                                        center: "",
                                        end: "today listDay,listWeek,listMonth prev,next",
                                    }}
                                    {...calendarProps}
                                    viewClassNames={(arg: ViewContentArg) => {
                                        setCurrentViewSmall(arg.view.type)
                                        return []
                                    }}
                                    datesSet={(arg: DatesSetArg) => {
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const date = (arg.view as any).getCurrentData().calendarApi.getDate()
                                        handleDateChange(date)
                                        setState(
                                            `collection-calendar-small-date-${labels.collection.toLowerCase()}`,
                                            "calendar-small-date",
                                            date.toISOString(),
                                        )
                                    }}
                                    {...calendarConfig.fullCalendarSmall}
                                />
                            )}
                        </CardContent>
                    </ScrollArea>
                </Card>
                {!relationList &&
                    preloadCache &&
                    calendarConfig.unscheduled &&
                    (!calendarConfig?.unscheduled.roles ||
                        calendarConfig?.unscheduled.roles.includes(permissions.Role)) &&
                    hasStartUpdateAccess && (
                        <Card className="hidden xl:block w-[300px] h-[calc(100vh-188px)] print:hidden">
                            <CardHeader className="px-4">
                                <CardTitle>{calendarConfig.unscheduled.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="h-full px-4">
                                {connectionStatus === "offline" ? (
                                    <div className="flex justify-center text-primary/50">
                                        <span>Not available in offline mode.</span>
                                    </div>
                                ) : unscheduledLoading ? (
                                    <div className="flex justify-center">
                                        <LoadingSpinner size={7} />
                                    </div>
                                ) : (
                                    <ScrollArea className="h-full pb-4">
                                        <Table>
                                            <TableBody>
                                                {unscheduledRecords.map((record) => (
                                                    <Row
                                                        key={record.id}
                                                        collection={collection}
                                                        record={record}
                                                        recordTitleField={recordTitleField}
                                                        isDisabled={!!isUpdateDisabled}
                                                    />
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </ScrollArea>
                                )}
                            </CardContent>
                        </Card>
                    )}
            </div>
        </>
    )
}

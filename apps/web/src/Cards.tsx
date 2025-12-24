import {
    CardsConfig,
    CollectionField,
    CollectionMeta,
    CollectionSchema,
    Filter,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import {
    canUpdateField,
    getCachedConfigValue,
    getField,
    getFieldCustomization,
    getSystemFieldsSchema,
    tryFunction,
} from "@stoker-platform/utils"
import {
    Cursor,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    onStokerPermissionsChange,
    subscribeOne,
    updateRecord,
} from "@stoker-platform/web-client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./components/ui/card"
import { cn } from "./lib/utils"
import { Move } from "lucide-react"
import { Separator } from "./components/ui/separator"
import { getFormattedFieldValue } from "./utils/getFormattedFieldValue"
import { useGoToRecord } from "./utils/goToRecord"
import { useDrag, useDrop } from "react-dnd"
import { useToast } from "./hooks/use-toast"
import cloneDeep from "lodash/cloneDeep.js"
import isEqual from "lodash/isEqual.js"
import { useGlobalLoading, useRouteLoading } from "./providers/LoadingProvider"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { isOfflineDisabled as isOfflineDisabledSync } from "./utils/isOfflineDisabled"
import { isServerUpdate } from "./utils/isServerWrite"
import { useOptimistic } from "./providers/OptimisticProvider"
import { FixedSizeList } from "react-window"
import { Query } from "./Collection"
import { serverReadOnly } from "./utils/serverReadOnly"
import InfiniteLoader from "react-window-infinite-loader"
import { useFilters } from "./providers/FiltersProvider"
import { getOrderBy } from "./utils/getOrderBy"
import { sortList } from "./utils/sortList"
import { useLocation } from "react-router"
import { FirestoreError, QueryConstraint, Timestamp, where } from "firebase/firestore"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { localFullTextSearch } from "./utils/localFullTextSearch"
import { Helmet } from "react-helmet"
import { useConnection } from "./providers/ConnectionProvider"

export const description = "A list of records as cards. The content area has a search bar in the header."

interface RowData {
    collection: CollectionSchema
    records: StokerRecord[]
    recordTitleField: string | undefined
    isOfflineDisabled: boolean | undefined
    cardsConfig: CardsConfig
    statusValue: string | number
    statusValues: (string | number)[]
    statusField: CollectionField
    isOver: boolean
}

interface CardItemProps {
    index: number
    style: React.CSSProperties
    data: RowData
}

function CardItem({ index, style, data }: CardItemProps) {
    const {
        collection,
        records,
        recordTitleField,
        isOfflineDisabled,
        cardsConfig,
        statusValue,
        statusValues,
        statusField,
        isOver,
    } = data
    // eslint-disable-next-line security/detect-object-injection
    const record = records[index]
    const { labels, access, fields } = collection
    const { serverWriteOnly } = access
    const systemFields = getSystemFieldsSchema()
    const customization = getCollectionConfigModule(labels.collection)
    const permissions = getCurrentUserPermissions()
    const location = useLocation()
    if (!permissions) {
        throw new Error("PERMISSION_DENIED")
    }
    const hasUpdateAccess = !!canUpdateField(collection, statusField, permissions)
    const goToRecord = useGoToRecord()
    const [connectionStatus] = useConnection()
    const { isGlobalLoading } = useGlobalLoading()
    const { isRouteLoading } = useRouteLoading()

    const headerFieldValue = cardsConfig.headerField
        ? getFormattedFieldValue(
              collection,
              getField(fields.concat(systemFields), cardsConfig.headerField),
              record,
              connectionStatus,
              1,
              goToRecord,
          )
        : undefined
    const maxFootlerLines = cardsConfig.maxFooterLines === 2 ? 2 : 1
    const footerFieldValue = cardsConfig.footerField
        ? getFormattedFieldValue(
              collection,
              getField(fields.concat(systemFields), cardsConfig.footerField),
              record,
              connectionStatus,
              maxFootlerLines,
              goToRecord,
          )
        : undefined

    const isServerReadOnly = serverReadOnly(collection)
    const isDisabled =
        connectionStatus === "offline" &&
        (isOfflineDisabled || serverWriteOnly || (collection.auth && ["Enabled", "Role"].includes(statusField.name)))
    const isPending = isGlobalLoading.has(record.id)
    const isPendingServer =
        isGlobalLoading.get(record.id)?.server ||
        ((isRouteLoading.has(location.pathname) || isPending) && isServerReadOnly)

    const [{ isDragging }, drag] = useDrag(
        () => ({
            type: "card",
            item: { record, statusValue },
            collect: (monitor) => ({
                isDragging: !!monitor.isDragging(),
            }),
            canDrag: () => !isPendingServer && !isDisabled && hasUpdateAccess,
        }),
        [statusValue, statusValues, statusField, isPendingServer, isDisabled, hasUpdateAccess],
    )

    useEffect(() => {
        const listener = function (event: DragEvent) {
            const target = event.target as HTMLElement
            if (target?.id !== `${statusValue}-${record.id}`) return
            const header = document.getElementById(`${statusValue}-${record.id}-header`)
            if (header) {
                const cloned = header.cloneNode(true) as HTMLElement
                cloned.style.position = "absolute"
                cloned.classList.add("bg-muted/50", "z-50", "w-[300px]")
                const headerField = cloned.querySelector("#header-field")
                headerField?.remove()
                document.body.appendChild(cloned)
                const rect = cloned.getBoundingClientRect()
                event.dataTransfer?.setDragImage(cloned, rect.width / 2, rect.height / 2)
                setTimeout(() => {
                    document.body.removeChild(cloned)
                })
            }
        }
        addEventListener("dragstart", listener, false)
        return () => {
            removeEventListener("dragstart", listener)
        }
    }, [])

    const [draggingDebounce, setDraggingDebounce] = useState<boolean>(false)
    useEffect(() => {
        if (isDragging) {
            setDraggingDebounce(true)
        } else {
            setDraggingDebounce(false)
        }
    }, [isDragging])

    let className = "ease-in transition-opacity duration-150"
    if (draggingDebounce) {
        className = cn(className, "opacity-0", "invisible")
    }

    let titleClass = ""
    if (isPendingServer || isDisabled) {
        titleClass = "text-muted-foreground"
    }

    const headerLineClamp = cardsConfig.maxHeaderLines === 2 ? "line-clamp-2" : "line-clamp-1"
    const headerHeight = cardsConfig.maxHeaderLines === 2 ? "h-32" : "h-24"
    const footerHeight = cardsConfig.maxFooterLines === 2 ? "h-14" : "h-12"

    const cardClass = cardsConfig.cardClass

    return (
        !isOver && (
            <div style={style} ref={drag} id={`${statusValue}-${record.id}`} className={className}>
                <Card className={cn("dark:border-none", cardClass)}>
                    <CardHeader
                        className={cn(
                            headerHeight,
                            "flex",
                            "flex-row",
                            "items-start",
                            "rounded-t-xl",
                            "cursor-pointer",
                            "p-0",
                            "bg-blue-500",
                            "dark:bg-blue-500/50",
                            "text-primary-foreground",
                            "dark:text-primary",
                        )}
                        onClick={() => goToRecord(collection, record)}
                    >
                        <div id={`${statusValue}-${record.id}-header`} className="grid gap-0.5 p-6">
                            <button
                                className={cn(
                                    titleClass,
                                    "group",
                                    "flex",
                                    "items-center",
                                    "gap-2",
                                    "text-lg",
                                    "overflow-hidden",
                                )}
                            >
                                <CardTitle
                                    className={cn(
                                        headerLineClamp,
                                        "hover:underline",
                                        "break-words",
                                        "text-left",
                                        "w-full",
                                        "pr-3",
                                        "leading-normal",
                                    )}
                                >
                                    {/* eslint-disable-next-line security/detect-object-injection */}
                                    {recordTitleField ? record[recordTitleField] : record.id}
                                </CardTitle>
                            </button>
                            {headerFieldValue && <div id="header-field">{headerFieldValue}</div>}
                        </div>
                        {!isPending ? (
                            !isDisabled &&
                            hasUpdateAccess && (
                                <div className="hidden ml-auto lg:flex items-center gap-1 cursor-grab p-6">
                                    <Move className="h-3.5 w-3.5" />
                                </div>
                            )
                        ) : (
                            <div className="ml-auto relative bottom-1.5 p-6">
                                <LoadingSpinner size={7} />
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className={cn("p-6 text-sm bg-muted/50", footerFieldValue ? "" : "rounded-b-xl")}>
                        {cardsConfig.sections.map((section, key) => {
                            const sectionLineClamp =
                                section.maxSectionLines === 4
                                    ? 4
                                    : section.maxSectionLines === 3
                                      ? 3
                                      : section.maxSectionLines === 2
                                        ? 2
                                        : 1
                            if (section.blocks) {
                                const collapse = tryFunction(section.collapse, [record])
                                let className = ""
                                if (collapse) {
                                    switch (collapse) {
                                        case "sm":
                                            className = cn(className, "hidden", "sm:grid")
                                            break
                                        case "md":
                                            className = cn(className, "hidden", "md:grid")
                                            break
                                        case "lg":
                                            className = cn(className, "hidden", "lg:grid")
                                            break
                                        case "xl":
                                            className = cn(className, "hidden", "xl:grid")
                                            break
                                        case "2xl":
                                            className = cn(className, "hidden", "2xl:grid")
                                            break
                                    }
                                }
                                let gridCols = "grid-cols-2"
                                if (collapse) {
                                    switch (collapse) {
                                        case "sm":
                                            gridCols = "grid-cols-1 sm:grid-cols-2"
                                            break
                                        case "md":
                                            gridCols = "grid-cols-1 md:grid-cols-2"
                                            break
                                        case "lg":
                                            gridCols = "grid-cols-1 lg:grid-cols-2"
                                            break
                                        case "xl":
                                            gridCols = "grid-cols-1 xl:grid-cols-2"
                                            break
                                        case "2xl":
                                            gridCols = "grid-cols-1 2xl:grid-cols-2"
                                            break
                                    }
                                }
                                const sectionHeight =
                                    section.maxSectionLines === 4
                                        ? "h-20"
                                        : section.maxSectionLines === 3
                                          ? "h-[3.75rem]"
                                          : section.maxSectionLines === 2
                                            ? "h-10"
                                            : "h-5"
                                return (
                                    <div key={key}>
                                        <div className="grid gap-3">
                                            <div className={cn("grid gap-3", collapse ? gridCols : "grid-cols-2")}>
                                                {section.fields.map((fieldName, index) => {
                                                    const field = getField(fields.concat(systemFields), fieldName)
                                                    if (!field) return null
                                                    const fieldCustomization = getFieldCustomization(
                                                        field,
                                                        customization,
                                                    )
                                                    const label =
                                                        tryFunction(fieldCustomization.admin?.label) || field.name
                                                    const hidden = index % 2 === 0 && className
                                                    return (
                                                        <div
                                                            key={fieldName}
                                                            className={cn("grid auto-rows-max gap-3", hidden)}
                                                        >
                                                            <div className="font-semibold line-clamp-1">{label}</div>
                                                            <div
                                                                className={cn(
                                                                    sectionHeight,
                                                                    "text-muted-foreground",
                                                                    "overflow-hidden",
                                                                    "break-words",
                                                                )}
                                                            >
                                                                {getFormattedFieldValue(
                                                                    collection,
                                                                    field,
                                                                    record,
                                                                    connectionStatus,
                                                                    sectionLineClamp,
                                                                    goToRecord,
                                                                    false,
                                                                    true,
                                                                ) || ""}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        {key !== cardsConfig.sections.length - 1 && <Separator className="my-4" />}
                                    </div>
                                )
                            } else if (section.large) {
                                const sectionHeight =
                                    section.maxSectionLines === 4
                                        ? "h-32"
                                        : section.maxSectionLines === 3
                                          ? "h-24"
                                          : section.maxSectionLines === 2
                                            ? "h-16"
                                            : "h-8"
                                return (
                                    <div key={key}>
                                        <div className="grid gap-3">
                                            {section.fields.map((fieldName) => {
                                                const field = getField(fields.concat(systemFields), fieldName)
                                                if (!field) return null
                                                const fieldCustomization = getFieldCustomization(field, customization)
                                                const label = tryFunction(fieldCustomization.admin?.label) || field.name
                                                /* eslint-disable security/detect-object-injection */
                                                return (
                                                    <div key={fieldName} className="grid gap-3">
                                                        <div className="font-semibold line-clamp-1">{label}</div>
                                                        <div
                                                            className={cn(
                                                                sectionHeight,
                                                                "flex",
                                                                "items-baseline",
                                                                "gap-2",
                                                                "text-3xl",
                                                                "font-bold",
                                                                "tabular-nums",
                                                                "leading-none",
                                                                "overflow-hidden",
                                                                "break-words",
                                                            )}
                                                        >
                                                            {getFormattedFieldValue(
                                                                collection,
                                                                field,
                                                                record,
                                                                connectionStatus,
                                                                sectionLineClamp,
                                                                goToRecord,
                                                                false,
                                                                true,
                                                            ) || ""}
                                                        </div>
                                                    </div>
                                                )
                                                /* eslint-enable security/detect-object-injection */
                                            })}
                                        </div>
                                        {key !== cardsConfig.sections.length - 1 && <Separator className="my-4" />}
                                    </div>
                                )
                            } else {
                                const sectionHeight =
                                    section.maxSectionLines === 4
                                        ? "h-20"
                                        : section.maxSectionLines === 3
                                          ? "h-[3.75rem]"
                                          : section.maxSectionLines === 2
                                            ? "h-10"
                                            : "h-5"
                                return (
                                    <div key={key}>
                                        {section.title && <div className="font-semibold mb-3">{section.title}</div>}
                                        <ul className="grid gap-3">
                                            {section.fields.map((fieldName) => {
                                                const field = getField(fields.concat(systemFields), fieldName)
                                                if (!field) return null
                                                const fieldCustomization = getFieldCustomization(field, customization)
                                                const label = tryFunction(fieldCustomization.admin?.label) || field.name
                                                return (
                                                    <li
                                                        key={fieldName}
                                                        className={cn(
                                                            sectionHeight,
                                                            "flex",
                                                            "items-center",
                                                            "justify-between",
                                                            "overflow-hidden",
                                                        )}
                                                    >
                                                        <span className="text-muted-foreground line-clamp-1">
                                                            {label}
                                                        </span>
                                                        <span className="max-w-[50%] text-right break-words">
                                                            {getFormattedFieldValue(
                                                                collection,
                                                                field,
                                                                record,
                                                                connectionStatus,
                                                                sectionLineClamp,
                                                                goToRecord,
                                                                false,
                                                                true,
                                                            ) || ""}
                                                        </span>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                        {key !== cardsConfig.sections.length - 1 && <Separator className="my-4" />}
                                    </div>
                                )
                            }
                        })}
                    </CardContent>
                    {footerFieldValue && (
                        <CardFooter
                            className={cn(
                                footerHeight,
                                "flex",
                                "flex-row",
                                "items-center",
                                "border-t",
                                "bg-muted/50",
                                "px-6",
                                "py-3",
                                "rounded-b-lg",
                            )}
                        >
                            <div className="text-xs text-muted-foreground">{footerFieldValue}</div>
                        </CardFooter>
                    )}
                </Card>
            </div>
        )
    )
}

const renderRow = ({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) => (
    <CardItem index={index} style={style} data={data} />
)

interface DropZoneProps {
    isOfflineDisabled: boolean | undefined
    statusValue: string | number
    statusField: CollectionField
    statusValues: (string | number)[]
    list: { [key: string | number]: StokerRecord[] | undefined }
    collection: CollectionSchema
    recordTitle: string | undefined
    recordTitleField: string | undefined
    cardsConfig: CardsConfig
    dragging: string | undefined
    setDragging: React.Dispatch<React.SetStateAction<string | undefined>>
    loadMoreItems: (statusValue: string | number) => Promise<void> | undefined
    itemsPerPage: number | undefined
    backToStart: () => void
    setOptimisticList: (serverList?: StokerRecord[], key?: string | number) => void
    search: string | undefined
}

function DropZone({
    isOfflineDisabled,
    statusValue,
    statusField,
    statusValues,
    list,
    collection,
    recordTitle,
    recordTitleField,
    cardsConfig,
    dragging,
    setDragging,
    loadMoreItems,
    itemsPerPage,
    backToStart,
    setOptimisticList,
    search,
}: DropZoneProps) {
    const { labels } = collection
    const { toast } = useToast()
    const { setGlobalLoading } = useGlobalLoading()
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    const { optimisticUpdates, removeOptimisticUpdate, setOptimisticUpdate, removeCacheOptimistic } = useOptimistic()
    const [settingOptimistic, setSettingOptimistic] = useState(false)
    const [height, setHeight] = useState(window.innerHeight - 188)

    const isServerReadOnly = serverReadOnly(collection)
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)

    const { order, filters, filterRecord } = useFilters()
    const [orderByField, setOrderByField] = useState<string | undefined>(undefined)
    const [orderByDirection, setOrderByDirection] = useState<"asc" | "desc" | undefined>(undefined)

    useEffect(() => {
        if (!isPreloadCacheEnabled && !isServerReadOnly) {
            const { orderByField, orderByDirection } = getOrderBy(collection, order)
            setOrderByField(orderByField)
            setOrderByDirection(orderByDirection)
        }
    }, [list])

    useEffect(() => {
        if (isPreloadCacheEnabled || isServerReadOnly) {
            const { orderByField, orderByDirection } = getOrderBy(collection, order)
            setOrderByField(orderByField)
            setOrderByDirection(orderByDirection)
        }
    }, [order])

    const firstLeave = useRef(true)

    const [{ isOver }, drop] = useDrop(
        () => ({
            accept: "card",
            drop: async ({
                record,
                statusValue: originalStatusValue,
            }: {
                record: StokerRecord
                statusValue: string | number
            }) => {
                firstLeave.current = true
                if (originalStatusValue === statusValue) return

                const offlineDisabled = await isOfflineDisabledSync("update", collection, record)
                if (offlineDisabled) {
                    alert(`You are offline and cannot update this record.`)
                    return
                }

                const serverWrite = isServerUpdate(collection, record)

                setSettingOptimistic(true)

                const optimisticUpdate = {
                    ...record,
                    [statusField.name]:
                        "values" in statusField && statusField.values ? statusValue : statusValue === statusValues[0],
                }
                setOptimisticUpdate(labels.collection, optimisticUpdate)

                setSettingOptimistic(false)

                const originalRecord = cloneDeep(record)

                setGlobalLoading("+", record.id, serverWrite, !(serverWrite || isServerReadOnly))

                if (!serverWrite) {
                    await new Promise((resolve) => setTimeout(resolve, 100))
                }

                if ("values" in statusField && statusField.values) {
                    updateRecord(
                        record.Collection_Path,
                        record.id,
                        { [statusField.name]: statusValue },
                        undefined,
                        undefined,
                        originalRecord,
                    )
                        .then(() => {
                            if (serverWrite || isServerReadOnly) {
                                toast({
                                    // eslint-disable-next-line security/detect-object-injection
                                    description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} updated successfully.`,
                                })
                            }
                            removeOptimisticUpdate(labels.collection, record.id)
                            if (isServerReadOnly) {
                                backToStart()
                            }
                        })
                        .catch((error) => {
                            console.error(error)
                            toast({
                                // eslint-disable-next-line security/detect-object-injection
                                description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} failed to update.`,
                                variant: "destructive",
                            })
                            removeOptimisticUpdate(labels.collection, record.id)
                            setOptimisticList(undefined, statusValue)
                            setOptimisticList(undefined, originalStatusValue)
                        })
                        .finally(() => {
                            setGlobalLoading("-", record.id, undefined, !(serverWrite || isServerReadOnly))
                        })
                } else if (statusField.type === "Boolean") {
                    updateRecord(
                        record.Collection_Path,
                        record.id,
                        {
                            [statusField.name]: statusValue === statusValues[0],
                        },
                        undefined,
                        undefined,
                        originalRecord,
                    )
                        .then(() => {
                            if (serverWrite || isServerReadOnly) {
                                toast({
                                    // eslint-disable-next-line security/detect-object-injection
                                    description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} updated successfully.`,
                                })
                            }
                            removeOptimisticUpdate(labels.collection, record.id)
                            if (isServerReadOnly) {
                                backToStart()
                            }
                        })
                        .catch((error) => {
                            console.error(error)
                            toast({
                                // eslint-disable-next-line security/detect-object-injection
                                description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} failed to update.`,
                                variant: "destructive",
                            })
                            removeOptimisticUpdate(labels.collection, record.id)
                            setOptimisticList(undefined, statusValue)
                            setOptimisticList(undefined, originalStatusValue)
                        })
                        .finally(() => {
                            setGlobalLoading("-", record.id, undefined, !(serverWrite || isServerReadOnly))
                        })
                }
                if (!serverWrite && !isServerReadOnly) {
                    removeCacheOptimistic(collection, record)
                    toast({
                        // eslint-disable-next-line security/detect-object-injection
                        description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} updated.`,
                    })
                }
            },
            collect: (monitor) => ({
                isOver: !!monitor.isOver(),
            }),
        }),
        [statusField, statusValue, statusValues, recordTitle, recordTitleField, setOptimisticList],
    )

    const [isOverDebounced, setIsOverDebounced] = useState(false)
    const [lastOver, setLastOver] = useState(0)
    const [lastLeave, setLastLeave] = useState(0)
    const isOverInitialised = useRef(false)

    useEffect(() => {
        let inTimer: NodeJS.Timeout | undefined
        let outTimer: NodeJS.Timeout | undefined
        if (!isOver) {
            if (
                lastOver &&
                Date.now() - lastOver < 100 &&
                (dragging !== statusValue.toString() || !firstLeave.current)
            ) {
                outTimer = setTimeout(() => {
                    clearTimeout(inTimer)
                    setIsOverDebounced(false)
                }, 100)
            } else {
                if (dragging || !isOverInitialised.current) {
                    isOverInitialised.current = true
                    firstLeave.current = false
                }
                clearTimeout(inTimer)
                setIsOverDebounced(false)
                setLastLeave(Date.now())
            }
        } else {
            if (!(lastLeave && Date.now() - lastLeave < 100)) {
                clearTimeout(outTimer)
                setIsOverDebounced(true)
                setLastOver(Date.now())
            } else {
                inTimer = setTimeout(() => {
                    clearTimeout(outTimer)
                    setIsOverDebounced(true)
                }, 100)
            }
        }
        return () => {
            clearTimeout(inTimer)
            clearTimeout(outTimer)
        }
    }, [isOver])

    let className = "ease-in transition-opacity duration-150"
    if (isOverDebounced || settingOptimistic) {
        className = cn(className, "opacity-0", "invisible")
    }

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1280) {
                setHeight(window.innerHeight - 238)
            } else {
                setHeight(window.innerHeight)
            }
        }
        handleResize()

        window.addEventListener("resize", handleResize)
        return () => {
            window.removeEventListener("resize", handleResize)
        }
    }, [])

    // eslint-disable-next-line security/detect-object-injection
    const statusList = list[statusValue]
    const latestList = list.latest
    const [removedList, setRemovedList] = useState<StokerRecord[]>([])

    const listSize = useMemo(() => {
        let size = 0
        for (const key of statusValues) {
            // eslint-disable-next-line security/detect-object-injection
            if (list[key]) {
                // eslint-disable-next-line security/detect-object-injection
                size += list[key].length
            }
        }
        return size
    }, [list, statusValues])

    useEffect(() => {
        if (optimisticUpdates && !isPreloadCacheEnabled && !isServerReadOnly) {
            removedList.forEach((record) => {
                const optimisticUpdate = optimisticUpdates
                    .get(labels.collection)
                    ?.find((update) => update.id === record.id)
                if (
                    optimisticUpdate &&
                    (optimisticUpdate[statusField.name] !==
                        (statusField.type === "Boolean" ? statusValue === statusValues[0] : statusValue) ||
                        !(
                            filterRecord(optimisticUpdate) &&
                            // eslint-disable-next-line security/detect-object-injection
                            (!search || localFullTextSearch(collection, search, [optimisticUpdate]).length > 0)
                        ))
                ) {
                    setRemovedList((prev) => prev.filter((record) => record.id !== record.id))
                }
            })
        }
    }, [optimisticUpdates])

    const records = useMemo(() => {
        if (!statusList) return []
        if (typeof orderByField !== "string") return []
        const removeEmptyRecords: StokerRecord[] = []
        const latestFiltered =
            latestList?.filter(
                (record) =>
                    record[statusField.name] ===
                        (statusField.type === "Boolean" ? statusValue === statusValues[0] : statusValue) &&
                    filterRecord(record),
            ) || []
        statusList
            ?.concat(latestFiltered)
            .concat(removedList)
            .forEach((record) => {
                if (record !== undefined) {
                    removeEmptyRecords.push(record)
                }
            })
        const dedupedRecords = Array.from(new Map(removeEmptyRecords.map((record) => [record.id, record])).values())
        let sortedList = sortList(collection, dedupedRecords, orderByField, orderByDirection)
        if (search && (isPreloadCacheEnabled || isServerReadOnly)) {
            const searchResults = localFullTextSearch(collection, search, sortedList).map((result) => result.id)
            sortedList = sortedList.filter((record) => searchResults.includes(record.id))
        }
        return sortedList
    }, [
        statusList,
        latestList,
        removedList,
        statusField,
        statusValue,
        statusValues,
        orderByField,
        orderByDirection,
        search,
    ])

    const [isFirstLoad, setIsFirstLoad] = useState(true)
    const [prevIds, setPrevIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        setIsFirstLoad(true)
    }, [filters, orderByField, orderByDirection])

    useEffect(() => {
        if (statusList && !isFirstLoad && !isPreloadCacheEnabled && !isServerReadOnly) {
            const removeEmptyRecords: StokerRecord[] = []
            statusList?.forEach((record) => {
                if (record !== undefined) {
                    removeEmptyRecords.push(record)
                }
            })
            const newIds = new Set(removeEmptyRecords?.map((record) => record.id))
            const removedIds = Array.from(prevIds.difference(newIds))
            removedIds.forEach((id) => {
                let unsubscribeOne: () => void
                const optimisticUpdate = optimisticUpdates?.get(labels.collection)?.find((update) => update.id === id)
                if (
                    optimisticUpdate &&
                    (optimisticUpdate[statusField.name] !==
                        (statusField.type === "Boolean" ? statusValue === statusValues[0] : statusValue) ||
                        !(
                            filterRecord(optimisticUpdate) &&
                            // eslint-disable-next-line security/detect-object-injection
                            (!search || localFullTextSearch(collection, search, [optimisticUpdate]).length > 0)
                        ))
                )
                    return
                // TODO: subcollection support
                subscribeOne([labels.collection], id, (record) => {
                    if (
                        record &&
                        record[statusField.name] ===
                            (statusField.type === "Boolean" ? statusValue === statusValues[0] : statusValue) &&
                        filterRecord(record) &&
                        // eslint-disable-next-line security/detect-object-injection
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
                        setUnsubscribe((prev) => [...prev, unsubscribeOne])
                    })
                    .catch(() => {})
            })
            setPrevIds(newIds)
        }
        if (statusList) {
            setIsFirstLoad(false)
        }
    }, [statusList])

    const [unsubscribe, setUnsubscribe] = useState<(() => void)[]>([])

    useEffect(() => {
        if (isFirstLoad) {
            setRemovedList([])
            unsubscribe.forEach((unsubscribeOne) => unsubscribeOne())
        }
    }, [isFirstLoad])

    useEffect(() => {
        return () => {
            unsubscribe.forEach((unsubscribeOne) => unsubscribeOne())
        }
    }, [])

    // eslint-disable-next-line security/detect-object-injection
    const itemKey = (index: number) => records[index].id

    const itemSize = useMemo(() => {
        let size = 0
        size += 0.5

        const headerHeight = cardsConfig.maxHeaderLines === 2 ? 27 : 19
        size += headerHeight
        if (cardsConfig.headerField) {
            size += 5
        }

        if (cardsConfig.sections.length > 0) {
            size += 12
        }
        for (const section of cardsConfig.sections) {
            if (cardsConfig.sections.indexOf(section) !== 0) {
                size += 8.25
            }
            if (section.blocks) {
                const sectionHeight =
                    section.maxSectionLines === 4
                        ? 28
                        : section.maxSectionLines === 3
                          ? 23
                          : section.maxSectionLines === 2
                            ? 18
                            : 13
                for (let i = 0; i < section.fields.length; i += 2) {
                    size += sectionHeight
                    if (i !== 0) {
                        size += 3
                    }
                }
            } else if (section.large) {
                const sectionHeight =
                    section.maxSectionLines === 4
                        ? 40
                        : section.maxSectionLines === 3
                          ? 32
                          : section.maxSectionLines === 2
                            ? 24
                            : 16
                for (const field of section.fields) {
                    size += sectionHeight
                    if (section.fields.indexOf(field) !== 0) {
                        size += 3
                    }
                }
            } else {
                size += 8
                const sectionHeight =
                    section.maxSectionLines === 4
                        ? 20
                        : section.maxSectionLines === 3
                          ? 15
                          : section.maxSectionLines === 2
                            ? 10
                            : 5
                for (const field of section.fields) {
                    size += sectionHeight
                    if (section.fields.indexOf(field) !== 0) {
                        size += 3
                    }
                }
            }
        }

        if (cardsConfig.footerField) {
            const footerHeight = cardsConfig.maxFooterLines === 2 ? 14 : 12
            size += footerHeight
        }

        size += 3

        return size * 4
    }, [cardsConfig])

    const itemData = {
        collection,
        records,
        recordTitleField,
        isOfflineDisabled,
        cardsConfig,
        statusValue,
        statusValues,
        statusField,
        isOver: isOverDebounced,
    }

    return (
        // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
        <div
            id={statusValue.toString()}
            className="col-span-1"
            ref={drop}
            onDragStart={() => {
                setDragging(statusValue.toString())
            }}
        >
            <Card className="mb-2">
                <CardHeader className="py-3">
                    <CardTitle className="flex justify-between">
                        <span>{statusValue}</span>{" "}
                        {(isPreloadCacheEnabled || isServerReadOnly) && records.length > 0 && !search && (
                            <span className="text-muted-foreground ml-2 text-right hidden xl:block">{`${records.length} | ${Math.round((records.length / listSize) * 100)}%`}</span>
                        )}
                    </CardTitle>
                </CardHeader>
            </Card>
            {isOverDebounced && <div className="bg-primary/50 rounded-lg h-full"></div>}
            <div className={cn(className, "rounded-lg", "space-y-4")}>
                {isPreloadCacheEnabled || isServerReadOnly ? (
                    <FixedSizeList
                        height={height}
                        width="100%"
                        itemSize={itemSize}
                        itemCount={records.length}
                        itemKey={itemKey}
                        overscanCount={5}
                        itemData={itemData}
                    >
                        {renderRow}
                    </FixedSizeList>
                ) : (
                    // eslint-disable-next-line security/detect-object-injection
                    <InfiniteLoader
                        isItemLoaded={(index) => index < records.length}
                        // eslint-disable-next-line security/detect-object-injection
                        itemCount={100000}
                        loadMoreItems={() => loadMoreItems(statusValue)}
                        minimumBatchSize={itemsPerPage || 10}
                        threshold={itemsPerPage || 40}
                    >
                        {({ onItemsRendered, ref }) => (
                            <FixedSizeList
                                height={height}
                                width="100%"
                                itemSize={itemSize}
                                itemCount={records.length}
                                overscanCount={10}
                                itemKey={itemKey}
                                ref={ref}
                                onItemsRendered={onItemsRendered}
                                itemData={itemData}
                            >
                                {renderRow}
                            </FixedSizeList>
                        )}
                    </InfiniteLoader>
                )}
            </div>
        </div>
    )
}

interface CardsProps {
    collection: CollectionSchema
    list: { [key: string | number]: StokerRecord[] | undefined }
    setList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    setServerList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    cursor: { [key: string | number]: Cursor | undefined }
    setCursor: React.Dispatch<React.SetStateAction<{ [key: string | number]: Cursor | undefined }>>
    count: { [key: string | number]: number | undefined }
    getData: (query: Query, key?: string | number) => Promise<void>
    unsubscribe: React.MutableRefObject<
        { [key: string | number]: ((direction?: "first" | "last") => void)[] } | undefined
    >
    statusFilter: string | undefined
    setStatusFilter: (value: string, firstLoad?: boolean) => void
    firstTabLoadCards: boolean | undefined
    backToStartKey: number
    setOptimisticList: () => void
    autoUpdateStatusFilter: boolean
    search: string | undefined
    relationList?: boolean
    formList?: boolean
}

export function Cards({
    collection,
    list,
    setList,
    setServerList,
    cursor,
    setCursor,
    getData,
    unsubscribe,
    statusFilter,
    setStatusFilter,
    firstTabLoadCards,
    backToStartKey,
    setOptimisticList,
    autoUpdateStatusFilter,
    search,
    relationList,
    formList,
}: CardsProps) {
    const { labels, fields, preloadCache, recordTitleField, fullTextSearch } = collection
    const customization = getCollectionConfigModule(labels.collection)
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")

    const [recordTitle, setRecordTitle] = useState<string | undefined>(undefined)
    const [collectionTitle, setCollectionTitle] = useState<string | undefined>(undefined)
    const [meta, setMeta] = useState<CollectionMeta | undefined>(undefined)
    const [cardsConfig, setCardsConfig] = useState<CardsConfig | undefined>(undefined)
    const [isOfflineDisabled, setIsOfflineDisabled] = useState<boolean | undefined>(undefined)

    const [statusField, setStatusField] = useState<CollectionField | undefined>(undefined)
    const [collectionStatusField, setCollectionStatusField] = useState<
        { field: string; active: unknown[]; archived: unknown[] } | undefined
    >(undefined)
    const [statusValues, setStatusValues] = useState<(string | number)[] | undefined>(undefined)

    const [dragging, setDragging] = useState<string | undefined>(undefined)
    const [itemsPerPage, setItemsPerPage] = useState<number | undefined>(undefined)
    const [query, setQuery] = useState<{ [key: string | number]: Query | undefined }>({})
    const [isLoading, setIsLoading] = useState<{ [key: string | number]: boolean }>({})
    const [ready, setReady] = useState(false)
    const [isInitialized, setIsInitialized] = useState(false)

    const isServerReadOnly = serverReadOnly(collection)
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)

    const { filters, order, getFilterConstraints } = useFilters()
    const constraints = useMemo(() => getFilterConstraints(), [filters, search])
    const { orderByField, orderByDirection } = useMemo(() => getOrderBy(collection, order), [order])
    const [prevOrder, setPrevOrder] = useState<{ id: string; desc: boolean }[] | undefined>(undefined)

    const backToStart = useCallback(
        (latestConstraints?: QueryConstraint[]) => {
            if (!statusField) return
            setList({})
            setServerList({})
            statusValues?.forEach((statusValue) => {
                let statusValueToUse: string | number | boolean = statusValue
                if (statusField.type === "Boolean") {
                    statusValueToUse = statusValue === statusValues[0]
                }
                const newQuery = {
                    infinite: !isPreloadCacheEnabled && !isServerReadOnly,
                    queries: [
                        {
                            constraints: [
                                ...(latestConstraints || constraints),
                                isServerReadOnly
                                    ? [statusField.name, "==", statusValueToUse]
                                    : where(statusField.name, "==", statusValueToUse),
                            ] as QueryConstraint[],
                            options:
                                !isPreloadCacheEnabled && !isServerReadOnly
                                    ? {
                                          pagination: {
                                              number: itemsPerPage || 10,
                                              orderByField,
                                              orderByDirection,
                                          },
                                      }
                                    : {},
                        },
                    ],
                }
                getData(newQuery, statusValue).then(() => {
                    setIsInitialized((prev) => {
                        if (prev) return prev
                        initialized.current++
                        if (initialized.current >= statusValues.length) {
                            return true
                        }
                        return false
                    })
                })
                setQuery((prev) => ({ ...prev, [statusValue]: newQuery }))

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
            statusValues,
            statusField,
            constraints,
            itemsPerPage,
            preloadCache,
            isServerReadOnly,
            orderByField,
            orderByDirection,
            isPreloadCacheEnabled,
            search,
        ],
    )

    useEffect(() => {
        if (!isInitialized) return
        backToStart()
    }, [backToStartKey])

    useEffect(() => {
        const timer = setTimeout(() => {
            if (isInitialized && fullTextSearch && !isPreloadCacheEnabled && !isServerReadOnly) {
                const constraints = removeCardsStatusFilter(filters)
                backToStart(constraints as QueryConstraint[])
            }
        }, 750)
        return () => clearTimeout(timer)
    }, [search])

    const removeCardsStatusFilter = useCallback(
        (latestFilters: Filter[]) => {
            if (
                (isPreloadCacheEnabled &&
                    cardsConfig?.statusField &&
                    cardsConfig.statusField !== collectionStatusField?.field) ||
                (!isPreloadCacheEnabled && !collectionStatusField?.field && cardsConfig?.statusField)
            ) {
                const cardsStatusFilter = latestFilters.find(
                    (filter) => filter.type !== "status" && filter.field === cardsConfig.statusField,
                )
                if (cardsStatusFilter) {
                    delete cardsStatusFilter.value
                }
            }
            return getFilterConstraints(latestFilters)
        },
        [isPreloadCacheEnabled, cardsConfig, collectionStatusField],
    )

    const backToStartRef = useRef(backToStart)
    useEffect(() => {
        backToStartRef.current = backToStart
    }, [backToStart])
    const filtersRef = useRef(filters)
    useEffect(() => {
        filtersRef.current = filters
    }, [filters])

    useEffect(() => {
        let unsubscribePermissions: (() => void) | undefined
        if (ready && statusValues) {
            const latestFilters = cloneDeep(filters)
            const statusFilterItem = latestFilters.find((filter) => filter.type === "status")
            if (statusFilterItem && autoUpdateStatusFilter) {
                if (statusFilter === "trash") {
                    statusFilterItem.value = "trash"
                } else {
                    statusFilterItem.value = "all"
                }
            }
            if (
                isPreloadCacheEnabled &&
                cardsConfig?.statusField &&
                cardsConfig.statusField !== collectionStatusField?.field
            ) {
                const cardsStatusFilter = latestFilters.find(
                    (filter) => filter.type !== "status" && filter.field === cardsConfig.statusField,
                )
                if (cardsStatusFilter) {
                    delete cardsStatusFilter.value
                }
            }
            const constraints = removeCardsStatusFilter(latestFilters)
            backToStart(constraints as QueryConstraint[])

            unsubscribePermissions = onStokerPermissionsChange(() => {
                const latestPermissions = getCurrentUserPermissions()
                if (
                    !isEqual(
                        latestPermissions?.collections?.[labels.collection],
                        originalPermissions.current?.collections?.[labels.collection],
                    )
                ) {
                    const constraints = removeCardsStatusFilter(filtersRef.current)
                    backToStartRef.current(constraints as QueryConstraint[])
                    originalPermissions.current = cloneDeep(latestPermissions)
                }
            })
        }
        return unsubscribePermissions
    }, [ready])

    useEffect(() => {
        if (!isInitialized || !statusField) return
        const constraints = removeCardsStatusFilter(cloneDeep(filters))
        backToStart(constraints as QueryConstraint[])
    }, [filters])

    useEffect(() => {
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
                if (!isPreloadCacheEnabled && !isServerReadOnly && statusField) {
                    const constraints = removeCardsStatusFilter(cloneDeep(filters))
                    backToStart(constraints as QueryConstraint[])
                }
            }
        }
    }, [order])

    const originalPermissions = useRef<StokerPermissions | null>(cloneDeep(permissions))
    const initialized = useRef(0)

    useEffect(() => {
        const prevStatusFilter = statusFilter
        if (statusFilter && autoUpdateStatusFilter) {
            if (statusFilter !== "trash") {
                setStatusFilter("all")
            }
        }

        let collectionStatusField: { field: string; active: unknown[]; archived: unknown[] } | undefined
        const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
            "collections",
            labels.collection,
            "admin",
        ]
        const initialize = async () => {
            const itemsPerPage = (await getCachedConfigValue(customization, [
                ...collectionAdminPath,
                "itemsPerPage",
            ])) as number | undefined
            setItemsPerPage(itemsPerPage)
            const offlineDisabled = await getCachedConfigValue(customization, [
                "collections",
                labels.collection,
                "custom",
                "disableOfflineUpdate",
            ])
            setIsOfflineDisabled(offlineDisabled)
            const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
            setCollectionTitle(titles?.collection)
            const meta = await getCachedConfigValue(customization, [...collectionAdminPath, "meta"])
            setMeta(meta)
            const cardsConfig = await getCachedConfigValue(customization, [...collectionAdminPath, "cards"])
            setCardsConfig(cardsConfig)
            collectionStatusField = await getCachedConfigValue(customization, [...collectionAdminPath, "statusField"])
            setCollectionStatusField(collectionStatusField)
            const statusField =
                (!isPreloadCacheEnabled && !collectionStatusField && cardsConfig.statusField) ||
                (isPreloadCacheEnabled && cardsConfig.statusField)
                    ? getField(fields, cardsConfig.statusField)
                    : getField(fields, collectionStatusField?.field)
            setStatusField(statusField)

            const statusValues: (string | number)[] = []
            const statusFieldCustomization = getFieldCustomization(statusField, customization)
            if ("values" in statusField && statusField.values) {
                statusField.values.forEach((value) => {
                    if (!cardsConfig.excludeValues?.includes(value)) {
                        statusValues.push(value)
                    }
                })
            } else if (statusField.type === "Boolean") {
                const fieldLabel = tryFunction(statusFieldCustomization.admin?.label) || statusField.name
                statusValues.push(fieldLabel, `Not ${fieldLabel}`)
            }
            setStatusValues(statusValues)

            const recordTitle = await getCachedConfigValue(customization, [...collectionAdminPath, "titles", "record"])
            setRecordTitle(recordTitle || labels.record)

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

        return () => {
            if (prevStatusFilter && autoUpdateStatusFilter) {
                if ((!firstTabLoadCards || prevStatusFilter === "trash") && prevStatusFilter) {
                    setStatusFilter(prevStatusFilter, true)
                } else if (collectionStatusField?.active) {
                    setStatusFilter("active", true)
                } else {
                    setStatusFilter("all", true)
                }
            }
        }
    }, [])

    const loadMoreItems = useCallback(
        (statusValue: string | number) => {
            // eslint-disable-next-line security/detect-object-injection
            if (isLoading[statusValue] || !statusField) return
            return new Promise<void>((resolve) => {
                // eslint-disable-next-line security/detect-object-injection
                if (cursor?.[statusValue]?.last.values().next().value === undefined) {
                    resolve()
                    return
                }
                setIsLoading((prev) => ({ ...prev, [statusValue]: true }))
                let statusValueToUse: string | number | boolean = statusValue
                if (statusField.type === "Boolean") {
                    statusValueToUse = statusValue === statusValues?.[0]
                }
                const newQuery = {
                    infinite: true,
                    queries: [
                        // eslint-disable-next-line security/detect-object-injection
                        ...(query?.[statusValue]?.queries || []),
                        {
                            constraints: [
                                ...constraints,
                                where(statusField.name, "==", statusValueToUse),
                            ] as QueryConstraint[],
                            options: {
                                pagination: {
                                    // eslint-disable-next-line security/detect-object-injection
                                    startAfter: cursor[statusValue],
                                    number: itemsPerPage || 10,
                                    orderByField,
                                    orderByDirection,
                                },
                            },
                        },
                    ],
                }
                getData(newQuery, statusValue)
                    .then(() => {
                        setQuery((prev) => ({ ...prev, [statusValue]: newQuery }))
                        resolve()
                    })
                    .catch((error) => {
                        if (error instanceof FirestoreError && error.code === "not-found") {
                            const constraints = removeCardsStatusFilter(cloneDeep(filters))
                            backToStart(constraints as QueryConstraint[])
                        }
                        resolve()
                    })
                    .finally(() => {
                        setIsLoading((prev) => ({ ...prev, [statusValue]: false }))
                    })
            })
        },
        [cursor, itemsPerPage, isLoading, query, constraints, filters, orderByField, orderByDirection],
    )

    if (!cardsConfig || !statusField || !statusValues) return null

    let gridCols
    switch (statusValues.length) {
        case 1:
            gridCols = "md:grid-cols-1"
            break
        case 2:
            gridCols = "md:grid-cols-2"
            break
        case 3:
            gridCols = "md:grid-cols-3"
            break
        case 4:
            gridCols = "md:grid-cols-4"
            break
        case 5:
            gridCols = "md:grid-cols-5"
            break
        default:
            gridCols = "md:grid-cols-5"
    }

    return (
        <>
            {!formList && (
                <Helmet>
                    <title>{`${meta?.title || collectionTitle || labels.collection} - Board`}</title>
                    {meta?.description && <meta name="description" content={meta.description} />}
                </Helmet>
            )}
            <div
                className={cn(
                    "grid",
                    "grid-cols-1",
                    gridCols,
                    "gap-4",
                    "pb-4",
                    "h-full",
                    "select-none",
                    relationList && "xl:h-[calc(100vh-304px)] overflow-y-scroll",
                )}
            >
                {statusValues.map((statusValue) => (
                    <DropZone
                        key={statusValue}
                        isOfflineDisabled={isOfflineDisabled}
                        statusValue={statusValue}
                        statusField={statusField}
                        statusValues={statusValues}
                        list={list}
                        collection={collection}
                        recordTitle={recordTitle}
                        recordTitleField={recordTitleField}
                        cardsConfig={cardsConfig}
                        dragging={dragging}
                        setDragging={setDragging}
                        loadMoreItems={loadMoreItems}
                        itemsPerPage={itemsPerPage}
                        backToStart={backToStart}
                        setOptimisticList={setOptimisticList}
                        search={search}
                    />
                ))}
            </div>
        </>
    )
}

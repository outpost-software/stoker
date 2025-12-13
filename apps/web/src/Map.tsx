import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
    CollectionMeta,
    CollectionSchema,
    MapConfig,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import { canUpdateField, getCachedConfigValue, getField, getSystemFieldsSchema } from "@stoker-platform/utils"
import {
    getAppCheck,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    onStokerPermissionsChange,
    updateRecord,
} from "@stoker-platform/web-client"
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Query } from "./Collection"
import { GoogleMap, MarkerClustererF, MarkerF, useJsApiLoader } from "@react-google-maps/api"
import { useGlobalLoading, useRouteLoading } from "./providers/LoadingProvider"
import { useLocation } from "react-router"
import { useGoToRecord } from "./utils/goToRecord"
import cloneDeep from "lodash/cloneDeep.js"
import isEqual from "lodash/isEqual"
import { ScrollArea } from "./components/ui/scroll-area"
import { Table, TableBody, TableCell, TableRow } from "./components/ui/table"
import { ArrowLeft } from "lucide-react"
import { isServerUpdate } from "./utils/isServerWrite"
import { useOptimistic } from "./providers/OptimisticProvider"
import { useToast } from "./hooks/use-toast"
import { isOfflineDisabled as isOfflineDisabledSync } from "./utils/isOfflineDisabled"
import { cn } from "./lib/utils"
import { useFilters } from "./providers/FiltersProvider"
import { getToken } from "@firebase/app-check"
import { serverReadOnly } from "./utils/serverReadOnly"
import { Helmet } from "react-helmet"
import { useConnection } from "./providers/ConnectionProvider"

export const description = "A list of records in a table. The content area has a search bar in the header."

function Row({
    collection,
    record,
    recordTitleField,
    mapConfig,
    noLocation,
    isDisabled,
    setNoLocation,
}: {
    collection: CollectionSchema
    record: StokerRecord
    recordTitleField: string | undefined
    mapConfig: MapConfig
    noLocation: StokerRecord | undefined
    isDisabled: boolean
    setNoLocation: React.Dispatch<React.SetStateAction<StokerRecord | undefined>>
}) {
    const goToRecord = useGoToRecord()
    // eslint-disable-next-line security/detect-object-injection
    const title = recordTitleField ? record[recordTitleField] : record.id

    const onClick = useCallback(() => {
        if (!(noLocation && noLocation.id === record.id)) {
            setNoLocation(record)

            const handleBodyClick = () => {
                setNoLocation(undefined)
                document.body.removeEventListener("click", handleBodyClick)
            }
            setTimeout(() => {
                document.body.addEventListener("click", handleBodyClick)
            }, 100)
        }
    }, [noLocation])

    return (
        <TableRow
            key={record.id}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    goToRecord(collection, record)
                }
            }}
            className="odd:bg-muted dark:odd:bg-primary-foreground dark:hover:bg-muted"
        >
            <TableCell className="whitespace-nowrap overflow-hidden">
                <div className="inline-flex items-center">
                    {mapConfig.coordinatesField && !isDisabled && (
                        <ArrowLeft
                            className="mr-2 h-3.5 w-3.5 relative bottom-[1px] text-foreground/50 cursor-pointer"
                            onClick={onClick}
                        />
                    )}
                    <button className="hover:underline" onClick={() => goToRecord(collection, record)}>
                        {title}
                    </button>
                </div>
            </TableCell>
        </TableRow>
    )
}

interface MapProps {
    collection: CollectionSchema
    list: StokerRecord[] | undefined
    setList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    setServerList: React.Dispatch<React.SetStateAction<{ [key: string | number]: StokerRecord[] | undefined }>>
    getData: (query: Query, direction?: "next" | "prev") => Promise<void>
    unsubscribe: React.MutableRefObject<{ [key: string | number]: ((direction?: "first" | "last") => void)[] }>
    backToStartKey: number
    setOptimisticList: () => void
    relationList?: boolean
    formList?: boolean
}

export function Map({
    collection,
    list,
    setList,
    setServerList,
    getData,
    unsubscribe,
    backToStartKey,
    setOptimisticList,
    relationList,
    formList,
}: MapProps) {
    const { labels, fields, access, recordTitleField } = collection
    const { serverWriteOnly } = access
    const customization = getCollectionConfigModule(labels.collection)
    const permissions = getCurrentUserPermissions()
    if (!permissions) {
        throw new Error("PERMISSION_DENIED")
    }
    const location = useLocation()
    const [connectionStatus] = useConnection()
    const goToRecord = useGoToRecord()
    const { toast } = useToast()

    const [recordTitle, setRecordTitle] = useState<string | undefined>(undefined)
    const [collectionTitle, setCollectionTitle] = useState<string | undefined>(undefined)
    const [meta, setMeta] = useState<CollectionMeta | undefined>(undefined)
    const [mapConfig, setMapConfig] = useState<MapConfig | undefined>(undefined)
    const [isOfflineDisabled, setIsOfflineDisabled] = useState<boolean | undefined>(undefined)
    const [hasLocationUpdateAccess, setHasLocationUpdateAccess] = useState<boolean>(false)

    const { isGlobalLoading, setGlobalLoading } = useGlobalLoading()
    const { isRouteLoading, setIsRouteLoading } = useRouteLoading()
    const [isLoaded, setIsLoaded] = useState(false)
    const [isInitialized, setIsInitialized] = useState(false)
    const isUpdatingRecord = useRef(false)

    const [noLocation, setNoLocation] = useState<StokerRecord | undefined>(undefined)
    const { removeOptimisticUpdate, setOptimisticUpdate, removeCacheOptimistic } = useOptimistic()

    const { filters, getFilterConstraints } = useFilters()
    const constraints = useMemo(() => getFilterConstraints(), [filters])

    const isServerReadOnly = serverReadOnly(collection)

    const firebaseConfigString = import.meta.env.STOKER_FB_WEB_APP_CONFIG
    if (!firebaseConfigString) {
        throw new Error("Firebase config not found")
    }
    const firebaseConfig = JSON.parse(firebaseConfigString)
    const mapKey = firebaseConfig.apiKey

    const { isLoaded: isMapLoaded } = useJsApiLoader({
        id: "google-map-script",
        googleMapsApiKey: mapKey,
    })

    const [isMapReady, setIsMapReady] = useState(false)

    useEffect(() => {
        const initialize = async () => {
            const appCheck = getAppCheck()
            if (!appCheck) setIsMapReady(true)
            if (typeof window.google !== "undefined" && window.google?.maps?.importLibrary) {
                const { Settings } = (await window.google.maps.importLibrary("core")) as google.maps.CoreLibrary
                // @ts-expect-error: The function is not exposed in the types
                Settings.getInstance().fetchAppCheckToken = () => getToken(appCheck, false)
                setIsMapReady(true)
            }
        }
        if (isMapLoaded) {
            initialize()
        }
    }, [isMapLoaded])

    useEffect(() => {
        const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
            "collections",
            labels.collection,
            "admin",
        ]
        const initialize = async () => {
            const recordTitle = await getCachedConfigValue(customization, [...collectionAdminPath, "titles", "record"])
            setRecordTitle(recordTitle || labels.record)
            const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
            setCollectionTitle(titles?.collection)
            const mapConfig = await getCachedConfigValue(customization, [...collectionAdminPath, "map"])
            setMapConfig(mapConfig)
            const meta = await getCachedConfigValue(customization, [...collectionAdminPath, "meta"])
            setMeta(meta)
            const offlineDisabled = await getCachedConfigValue(customization, [
                "collections",
                labels.collection,
                "custom",
                "disableOfflineUpdate",
            ])
            setIsOfflineDisabled(offlineDisabled)

            const systemFields = getSystemFieldsSchema()
            const allFields = fields.concat(systemFields)

            const addressField = mapConfig?.addressField
            const coordinatesField = mapConfig?.coordinatesField
            if (addressField && fields.map((field) => field.name).includes(addressField)) {
                const addressFieldSchema = getField(allFields, addressField)
                const hasAddressUpdateAccess = !!canUpdateField(collection, addressFieldSchema, permissions)
                setHasLocationUpdateAccess(hasAddressUpdateAccess)
            } else if (coordinatesField && fields.map((field) => field.name).includes(coordinatesField)) {
                const coordinatesFieldSchema = getField(allFields, coordinatesField)
                const hasCoordinatesUpdateAccess = !!canUpdateField(collection, coordinatesFieldSchema, permissions)
                setHasLocationUpdateAccess(hasCoordinatesUpdateAccess)
            }

            setList({})
            setServerList({})
            if (unsubscribe.current) {
                Object.values(unsubscribe.current).forEach((unsubscribe) =>
                    unsubscribe.forEach((unsubscribe) => unsubscribe()),
                )
            }

            // Prevent race condition when transitioning from cards to map view and auto-updating status filter
            const constraints = getFilterConstraints()

            getData({
                infinite: false,
                queries: [
                    {
                        constraints,
                        options: {
                            pagination: {
                                orderByField: `${recordTitleField}_Lowercase`,
                                orderByDirection: "asc",
                            },
                        },
                    },
                ],
            }).then(() => {
                setIsRouteLoading("+", location.pathname)
                setIsLoaded(true)
            })
        }
        initialize()
        return () => {
            setIsRouteLoading("-", location.pathname)
        }
    }, [])

    const reload = useCallback(() => {
        if (isInitialized) {
            setIsInitialized(false)
            setIsLoaded(false)
            getData({
                infinite: false,
                queries: [
                    {
                        constraints,
                        options: {
                            pagination: {
                                orderByField: `${recordTitleField}_Lowercase`,
                                orderByDirection: "asc",
                            },
                        },
                    },
                ],
            }).then(() => {
                setIsRouteLoading("+", location.pathname)
                setIsLoaded(true)
            })
        }
    }, [location.pathname, isInitialized, constraints, recordTitleField])

    useEffect(() => {
        reload()
    }, [filters])

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

    const containerStyle = {
        width: "100%",
        height: "100%",
        borderRadius: "0.75rem",
    }

    const center = mapConfig?.center

    const [map, setMap] = useState<google.maps.Map | null>(null)
    if (map) {
        map?.setOptions({
            draggableCursor: noLocation ? "crosshair" : "grab",
        })
    }

    const [markers, setMarkers] = useState<
        {
            id: string
            title: string
            position: { lat: number; lng: number }
        }[]
    >([])
    const [prevList, setPrevList] = useState<StokerRecord[] | undefined>(undefined)

    const onLoad = useCallback((map: google.maps.Map) => {
        setMap(map)
    }, [])

    const onUnmount = useCallback(() => {
        setMap(null)
    }, [])

    const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number }> => {
        if (typeof window.google === "undefined" || !window.google?.maps?.Geocoder) {
            throw new Error("Google Maps API not available")
        }
        const geocoder = new window.google.maps.Geocoder()
        return new Promise((resolve, reject) => {
            geocoder.geocode({ address }, (results, status) => {
                if (results && status === "OK") {
                    const { lat, lng } = results[0].geometry.location
                    resolve({ lat: lat(), lng: lng() })
                } else {
                    reject()
                }
            })
        })
    }

    const fetchMarkers = useCallback(async () => {
        if (!list) return
        const batches = []
        for (let i = 0; i < list.length; i += 50) {
            const batch = list.slice(i, i + 50).map(async (record) => {
                // eslint-disable-next-line security/detect-object-injection
                const title = recordTitleField ? record[recordTitleField] : record.id
                if (mapConfig?.coordinatesField) {
                    const coordinatesField = mapConfig?.coordinatesField
                    if (!coordinatesField) return null
                    // eslint-disable-next-line security/detect-object-injection
                    const coordinates = record[coordinatesField]
                    if (!coordinates) return null
                    const latitude = coordinates[0]
                    const longitude = coordinates[1]
                    if (!latitude || !longitude) return null
                    return { id: record.id, title, position: { lat: latitude, lng: longitude } }
                } else if (mapConfig?.addressField) {
                    const addressField = mapConfig?.addressField
                    if (!addressField) return null
                    // eslint-disable-next-line security/detect-object-injection
                    const address = record[addressField]
                    const prevRecord = prevList?.find((prevRecord) => prevRecord.id === record.id)
                    // eslint-disable-next-line security/detect-object-injection
                    if (prevRecord && prevRecord[addressField] === address) {
                        const prevMarker = markers.find((marker) => marker.id === record.id)
                        if (prevMarker) return { id: record.id, title, position: prevMarker.position }
                        else return null
                    }
                    if (address) {
                        try {
                            const { lat, lng } = await geocodeAddress(address)
                            return { id: record.id, title, position: { lat, lng } }
                        } catch {
                            return null
                        }
                    }
                    return null
                }
                return null
            })
            batches.push(Promise.all(batch))
        }

        const results = await Promise.all(batches)
        const newMarkers = results.flat().filter((marker) => marker !== null)
        startTransition(() => {
            setMarkers(newMarkers)
            setIsRouteLoading("-", location.pathname)
            setPrevList(cloneDeep(list))
            if (!isInitialized) {
                setTimeout(() => {
                    setIsInitialized(true)
                }, 50)
            }
        })
    }, [list, prevList, markers, recordTitleField, mapConfig])

    useEffect(() => {
        if (isLoaded && list) {
            fetchMarkers()
        }
    }, [list])

    const noLocationRecords = useMemo(() => {
        if (!mapConfig || !list) return []
        if (mapConfig.addressField) {
            return list.filter((record) => !(mapConfig.addressField && record[mapConfig.addressField]))
        } else if (mapConfig.coordinatesField) {
            return list.filter(
                (record) =>
                    !(
                        mapConfig.coordinatesField &&
                        record[mapConfig.coordinatesField] &&
                        record[mapConfig.coordinatesField][0] &&
                        record[mapConfig.coordinatesField][1]
                    ),
            )
        }
        return []
    }, [mapConfig, list])

    const updateMarker = useCallback(
        async (record: StokerRecord, lat: number, lng: number) => {
            if (!(mapConfig && mapConfig.coordinatesField)) return
            const updatedFields = {
                [mapConfig?.coordinatesField]: [lat, lng],
            }

            const offlineDisabled = await isOfflineDisabledSync("update", collection, record)
            if (offlineDisabled) {
                alert(`You are offline and cannot update this record.`)
                removeOptimisticUpdate(labels.collection, record.id)
                return
            }

            const serverWrite = isServerUpdate(collection, record)

            const optimisticUpdate = {
                ...record,
                ...updatedFields,
            }
            setOptimisticUpdate(labels.collection, optimisticUpdate)

            const originalRecord = cloneDeep(record)

            setGlobalLoading("+", record.id, serverWrite, !(serverWrite || isServerReadOnly))
            isUpdatingRecord.current = false
            updateRecord(record.Collection_Path, record.id, updatedFields, undefined, undefined, originalRecord)
                .then(() => {
                    if (serverWrite || isServerReadOnly) {
                        toast({
                            // eslint-disable-next-line security/detect-object-injection
                            description: `${recordTitle} ${recordTitleField ? record[recordTitleField] : record.id} updated successfully.`,
                        })
                    }
                    removeOptimisticUpdate(labels.collection, record.id)
                    if (isServerReadOnly) {
                        reload()
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
        [mapConfig, recordTitle, recordTitleField, reload],
    )

    const onClick = useCallback(
        async (event: google.maps.MapMouseEvent) => {
            if (noLocation && event.latLng) {
                setNoLocation(undefined)
                updateMarker(noLocation, event.latLng.lat(), event.latLng.lng())
            }
        },
        [noLocation, updateMarker],
    )

    const onDragEnd = useCallback(
        (event: google.maps.MapMouseEvent, marker: string) => {
            if (!event.latLng) return
            const record = list?.find((record) => record.id === marker)
            if (!record) return
            updateMarker(record, event.latLng.lat(), event.latLng.lng())
        },
        [list, updateMarker],
    )

    const isDisabled = connectionStatus === "offline" && (isOfflineDisabled || serverWriteOnly)
    const isDraggable = !!(mapConfig && mapConfig.coordinatesField && hasLocationUpdateAccess && !isDisabled)

    if (!mapConfig) return null

    const background = noLocation ? "bg-primary " : ""

    if (connectionStatus === "offline") {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-300px)]">
                <Card className="w-full lg:w-auto lg:min-w-[750px] text-center">
                    <CardHeader>
                        <CardTitle>You are offline.</CardTitle>
                    </CardHeader>
                    <CardContent>{`${mapConfig.title || "The map"} is not available in offline mode.`}</CardContent>
                </Card>
            </div>
        )
    }

    return (
        <>
            {!formList && (
                <Helmet>
                    <title>{`${meta?.title || collectionTitle || labels.collection} - Map`}</title>
                    {meta?.description && <meta name="description" content={meta.description} />}
                </Helmet>
            )}
            <div className="flex gap-4 select-none">
                <Card
                    className={cn(
                        "h-screen",
                        "flex-1",
                        "mb-2",
                        "xl:mb-0",
                        relationList ? "xl:h-[calc(100vh-304px)] overflow-y-scroll" : "xl:h-[calc(100vh-204px)]",
                        "print:h-[500px]",
                        background,
                    )}
                >
                    {isMapReady && (
                        <CardContent className="h-full p-3">
                            <GoogleMap
                                id="map"
                                mapContainerStyle={containerStyle}
                                center={center}
                                zoom={mapConfig.zoom}
                                onLoad={onLoad}
                                onUnmount={onUnmount}
                                onClick={onClick}
                            >
                                {isInitialized && markers.length > 0 && (
                                    <MarkerClustererF>
                                        {(clusterer) => (
                                            <>
                                                {markers.map((marker) => {
                                                    return (
                                                        <MarkerF
                                                            key={marker.id}
                                                            position={marker.position}
                                                            label={marker.title}
                                                            onClick={() => {
                                                                const record = list?.find(
                                                                    (record) => record.id === marker.id,
                                                                )
                                                                if (!record) return
                                                                goToRecord(collection, record)
                                                            }}
                                                            clusterer={clusterer}
                                                            draggable={
                                                                isDraggable &&
                                                                !(
                                                                    isGlobalLoading.get(marker.id)?.server ||
                                                                    ((isRouteLoading.has(location.pathname) ||
                                                                        isGlobalLoading.get(marker.id)) &&
                                                                        isServerReadOnly)
                                                                )
                                                            }
                                                            onDragEnd={(event: google.maps.MapMouseEvent) => {
                                                                if (isUpdatingRecord.current) return
                                                                isUpdatingRecord.current = true
                                                                onDragEnd(event, marker.id)
                                                            }}
                                                        />
                                                    )
                                                })}
                                            </>
                                        )}
                                    </MarkerClustererF>
                                )}
                            </GoogleMap>
                        </CardContent>
                    )}
                </Card>
                {mapConfig.noLocation && hasLocationUpdateAccess && (
                    <Card
                        className={cn(
                            "hidden xl:block w-[300px] print:hidden",
                            relationList ? "xl:h-[calc(100vh-304px)] overflow-y-scroll" : "xl:h-[calc(100vh-204px)]",
                        )}
                    >
                        <CardHeader className="px-4">
                            <CardTitle>{mapConfig.noLocation.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="h-full px-4">
                            <ScrollArea className="h-full pb-4">
                                <Table>
                                    <TableBody>
                                        {noLocationRecords.map((record) => (
                                            <Row
                                                key={record.id}
                                                collection={collection}
                                                record={record}
                                                recordTitleField={recordTitleField}
                                                mapConfig={mapConfig}
                                                noLocation={noLocation}
                                                isDisabled={!isDraggable}
                                                setNoLocation={setNoLocation}
                                            />
                                        ))}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    )
}

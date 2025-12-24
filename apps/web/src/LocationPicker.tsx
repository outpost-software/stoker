import { useCallback, useState, useEffect } from "react"
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { getAppCheck } from "@stoker-platform/web-client"
import { getToken } from "@firebase/app-check"

interface LocationPickerProps {
    value?: [number, number] | null
    onChange: (value: [number, number] | null) => void
    disabled?: boolean
    label?: string
    defaultCenter?: { lat: number; lng: number }
    defaultZoom?: number
}

export function LocationPicker({ value, onChange, disabled, defaultCenter, defaultZoom }: LocationPickerProps) {
    const [center, setCenter] = useState<{ lat: number; lng: number } | undefined>(undefined)

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
            if (typeof window.google !== "undefined" && window.google?.maps?.importLibrary) {
                const { Settings } = (await window.google.maps.importLibrary("core")) as google.maps.CoreLibrary
                // @ts-expect-error: The function is not exposed in the types
                Settings.getInstance().fetchAppCheckToken = () => getToken(appCheck, false)
                setIsMapReady(true)
                setCenter(value ? { lat: value[0], lng: value[1] } : defaultCenter)
            }
        }
        if (isMapLoaded) {
            initialize()
        }
    }, [isMapLoaded])

    const handleMapClick = useCallback((event: google.maps.MapMouseEvent) => {
        if (event.latLng) {
            const newLocation = { lat: event.latLng.lat(), lng: event.latLng.lng() }
            if (newLocation) {
                onChange([newLocation.lat, newLocation.lng])
            } else {
                onChange(null)
            }
        }
    }, [])

    const handleClear = useCallback(() => {
        onChange(null)
    }, [onChange])

    const containerStyle = {
        width: "100%",
        height: "400px",
        borderRadius: "0.5rem",
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <div className="space-y-4 flex-1">
                    {isMapReady && center ? (
                        <GoogleMap
                            mapContainerStyle={containerStyle}
                            center={center}
                            zoom={defaultZoom}
                            onClick={handleMapClick}
                            options={{
                                gestureHandling: "cooperative",
                            }}
                        >
                            {value && (
                                <MarkerF
                                    position={{ lat: value[0], lng: value[1] }}
                                    draggable={true}
                                    onDragEnd={(event) => {
                                        if (event.latLng) {
                                            onChange([event.latLng.lat(), event.latLng.lng()])
                                        }
                                    }}
                                />
                            )}
                        </GoogleMap>
                    ) : (
                        <div className="h-[400px] flex items-center justify-center border rounded-lg">
                            <p>Loading map...</p>
                        </div>
                    )}
                </div>
                {value && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                        disabled={disabled}
                        className="p-1"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
    )
}

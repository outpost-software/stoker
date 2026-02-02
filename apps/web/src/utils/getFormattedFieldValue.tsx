import {
    CollectionCustomization,
    CollectionField,
    CollectionSchema,
    RelationField,
    StokerRecord,
} from "@stoker-platform/types"
import { collectionAccess, getFieldCustomization, isRelationField, tryFunction } from "@stoker-platform/utils"
import { Timestamp } from "firebase/firestore"
import zip from "lodash/zip.js"
import { convertTimestampToTimezone, getCurrentUserPermissions, getSchema } from "@stoker-platform/web-client"
import { Badge } from "../components/ui/badge"
import { Check, X } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Button } from "@/components/ui/button"
import { preloadCacheEnabled } from "./preloadCacheEnabled"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { getSafeUrl } from "./isSafeUrl"

export const getFormattedFieldValue = (
    customization: CollectionCustomization,
    field: CollectionField,
    record: StokerRecord,
    connectionStatus: "online" | "offline",
    maxLines?: 1 | 2 | 3 | 4 | 5 | 6,
    goToRecord?: (collection: CollectionSchema, record: StokerRecord, field: RelationField) => void,
    form?: boolean,
    card?: boolean | "header",
) => {
    let lineClamp = "line-clamp-6"
    switch (maxLines) {
        case 1:
            lineClamp = "line-clamp-1"
            break
        case 2:
            lineClamp = "line-clamp-2"
            break
        case 3:
            lineClamp = "line-clamp-3"
            break
        case 4:
            lineClamp = "line-clamp-4"
            break
        case 5:
            lineClamp = "line-clamp-5"
            break
    }

    const schema = getSchema()
    const fieldCustomization = getFieldCustomization(field, customization)
    const permissions = getCurrentUserPermissions()
    if (!permissions) return ""
    let badge: boolean | string,
        italic: boolean,
        tags: string[] | undefined,
        image: boolean | undefined,
        time: boolean | undefined,
        currency: boolean | undefined
    if (fieldCustomization) {
        badge = tryFunction(fieldCustomization.admin?.badge, [record])
        italic = tryFunction(fieldCustomization.admin?.italic, [record])
        tags = tryFunction(fieldCustomization.admin?.tags)
        image = tryFunction(fieldCustomization.admin?.image)
        time = tryFunction(fieldCustomization.admin?.time)
        currency = tryFunction(fieldCustomization.admin?.currency)
    }

    let value = record[field.name]
    if (fieldCustomization?.admin?.modifyDisplayValue) {
        value = tryFunction(fieldCustomization.admin.modifyDisplayValue, [
            record,
            card ? "card" : form ? "form" : "list",
        ])
    }
    if (value === undefined || value === null) return ""

    const getStandardDisplay = () => {
        if (badge) {
            if (badge === true) {
                return (
                    <Badge variant="outline" className="text-center">
                        {value}
                    </Badge>
                )
            } else {
                return (
                    <Badge
                        variant={
                            ["outline", "destructive", "primary", "secondary"].includes(badge)
                                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  (badge as any)
                                : "outline"
                        }
                        className={cn(
                            "text-xs text-center",
                            !["outline", "destructive", "primary", "secondary", true, false].includes(badge) && badge,
                        )}
                    >
                        {value}
                    </Badge>
                )
            }
        } else if (currency) {
            return (
                <span
                    className={cn(lineClamp, "break-words", form && "text-sm")}
                >{`${currency}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
            )
        } else if (italic) {
            return <em className={cn(lineClamp, "break-words", form && "text-sm")}>{value}</em>
        } else {
            return (
                <div className="max-w-[calc(100vw-64px)]">
                    <span className={cn(lineClamp, "break-words", form && "text-sm")}>{value}</span>
                </div>
            )
        }
    }

    const Image = ({ src, alt }: { src: string; alt?: string }) => {
        const [loaded, setLoaded] = useState(false)
        return (
            <img
                src={getSafeUrl(src)}
                alt={alt || ""}
                onLoad={() => setLoaded(true)}
                className={cn(
                    loaded ? "opacity-100" : "opacity-0",
                    form ? "max-h-[300px]" : "max-h-[60px]",
                    "transition-opacity duration-300 ease-in-out max-w-full object-contain rounded",
                )}
            />
        )
    }

    if (isRelationField(field)) {
        const titleField = field.titleField
        const relationCollection = schema.collections[field.collection]
        if (["OneToOne", "OneToMany"].includes(field.type)) {
            return (
                Object.keys(value).length === 1 && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                            "w-full max-w-[200px] whitespace-normal break-words h-auto p-3 bg-blue-500 dark:bg-blue-500/50 text-primary-foreground dark:text-primary hover:bg-blue-500 dark:hover:bg-blue-500 border-transparent dark:border-input",
                            !card && "min-w-[100px]",
                        )}
                        disabled={
                            !relationCollection ||
                            (connectionStatus === "offline" && !preloadCacheEnabled(relationCollection))
                        }
                        onClick={() => {
                            const record = Object.values(value)[0] as StokerRecord
                            record.id = Object.keys(value)[0]
                            if (
                                goToRecord &&
                                permissions.collections?.[field.collection] &&
                                collectionAccess("Read", permissions.collections[field.collection])
                            ) {
                                goToRecord(relationCollection, record, field)
                            }
                        }}
                    >
                        <span className={cn(card === "header" && "line-clamp-2")}>
                            {/* eslint-disable-next-line security/detect-object-injection */}
                            {titleField ? (Object.values(value)[0] as StokerRecord)[titleField] : Object.keys(value)[0]}
                        </span>
                    </Button>
                )
            )
        } else {
            if (titleField) {
                return (
                    <span className={cn(lineClamp, "text-sm")}>
                        {Object.values(value)
                            .map((relation) => {
                                // eslint-disable-next-line security/detect-object-injection
                                return (relation as Record<string, unknown>)[titleField]
                            })
                            .join(", ")}
                    </span>
                )
            } else {
                return <span className={lineClamp}>{Object.keys(value).join(", ")}</span>
            }
        }
    } else {
        switch (field.type) {
            case "Computed":
                if (value === "tick") {
                    return (
                        <div className="w-full flex justify-start">
                            <Check />
                        </div>
                    )
                } else if (value === "cross") {
                    return (
                        <div className="w-full flex justify-start">
                            <X />
                        </div>
                    )
                } else {
                    return getStandardDisplay()
                }
            case "String":
                if (image) {
                    return (
                        <div className="w-full min-w-[100px]">
                            <Image src={value} alt={field.name} />
                        </div>
                    )
                }
                return getStandardDisplay()
            case "Number":
                if (field.autoIncrement) {
                    if (value === "Pending") {
                        return (
                            <div className="flex items-center h-full">
                                <LoadingSpinner size={4} />
                            </div>
                        )
                    }
                }
                return getStandardDisplay()
            case "Timestamp": {
                const date = convertTimestampToTimezone(new Timestamp(value.seconds, value.nanoseconds))
                const formattedDate = time ? date.toFormat("MMMM d, yyyy '@' h:mm a") : date.toFormat("MMMM d, yyyy")
                return (
                    <span className={lineClamp}>
                        <time className="text-sm">{formattedDate}</time>
                    </span>
                )
            }
            case "Boolean":
                return value ? (
                    <div className="w-full flex justify-start">
                        <Check />
                    </div>
                ) : (
                    <div className="w-full flex justify-start">
                        <X />
                    </div>
                )
            case "Array":
                if (tags && Array.isArray(value) && value.length > 0) {
                    return (
                        <div className="flex flex-wrap gap-1">
                            {value.map((item, index) => {
                                // eslint-disable-next-line security/detect-object-injection
                                const tagColor = tags?.[index] || "default"
                                return (
                                    <Badge
                                        key={index}
                                        variant={
                                            ["outline", "destructive", "primary", "secondary"].includes(tagColor)
                                                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                  (tagColor as any)
                                                : "outline"
                                        }
                                        className={cn(
                                            "text-xs",
                                            !["outline", "destructive", "primary", "secondary", true, false].includes(
                                                tagColor,
                                            ) && tagColor,
                                        )}
                                    >
                                        {item}
                                    </Badge>
                                )
                            })}
                        </div>
                    )
                }
                return <span className={cn(lineClamp, "text-sm")}>{value.join(", ")}</span>
            case "Map":
                return (
                    <span className={cn(lineClamp, "text-sm")}>
                        {zip(Object.keys(value), Object.values(value))
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(", ")}
                    </span>
                )
            default:
                return value
        }
    }
}

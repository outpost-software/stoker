import {
    Assignable,
    CollectionField,
    CollectionSchema,
    Filter,
    RelationFilter,
    RelationList,
    SelectFilter,
    StokerCollection,
    StokerRecord,
} from "@stoker-platform/types"
import {
    collectionAccess,
    getCachedConfigValue,
    getField,
    getFieldCustomization,
    hasDependencyAccess,
    isRelationField,
    tryFunction,
} from "@stoker-platform/utils"
import {
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getOne,
    getSchema,
    getSome,
} from "@stoker-platform/web-client"
import { startTransition, useCallback, useEffect, useRef, useState } from "react"
import { useFilters } from "./providers/FiltersProvider"
import { useRouteLoading } from "./providers/LoadingProvider"
import { useLocation } from "react-router"
import { useStokerState } from "./providers/StateProvider"
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover"
import { Sheet, SheetContent, SheetTrigger } from "./components/ui/sheet"
import { useIsMobile } from "./hooks/use-mobile"
import { useKeyboardOffset } from "./hooks/use-keyboard-offset"
import { Button } from "./components/ui/button"
import { Check, ChevronsUpDown } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/ui/command"
import { cn } from "./lib/utils"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select"
import { Label } from "./components/ui/label"
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { getFilterDisjunctions } from "./utils/getFilterDisjunctions"
import { performFullTextSearch } from "./utils/performFullTextSearch"
import { serverReadOnly } from "./utils/serverReadOnly"
import { QueryConstraint, where, WhereFilterOp } from "firebase/firestore"
import { localFullTextSearch } from "./utils/localFullTextSearch"
import { useConnection } from "./providers/ConnectionProvider"

interface FiltersProps {
    collection: CollectionSchema
    excluded: string[]
    relationList?: RelationList
    relationCollection?: CollectionSchema
    relationParent?: StokerRecord
    assignable?: Assignable
    isAssigning?: boolean
    isSidebar?: boolean
}

export function Filters({
    collection,
    excluded,
    relationList,
    relationCollection,
    relationParent,
    assignable,
    isAssigning,
    isSidebar,
}: FiltersProps) {
    const { labels, fields } = collection
    const location = useLocation()
    const schema = getSchema()
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    const customization = getCollectionConfigModule(labels.collection)

    const { filters, setFilters } = useFilters()
    const [, setState] = useStokerState()
    const { isRouteLoading, isRouteLoadingImmediate } = useRouteLoading()
    const [connectionStatus] = useConnection()

    const isPreloadCacheEnabled = preloadCacheEnabled(collection)

    const [arrayContainsFilterSet, setArrayContainsFilterSet] = useState<string | undefined>(undefined)

    const [open, setOpen] = useState<Record<string, boolean>>({})
    const [inputValue, setValue] = useState<Record<string, string>>({})
    const [searchValue, setSearchValue] = useState<Record<string, string>>({})
    const [prevSearchValue, setPrevSearchValue] = useState<Record<string, string>>({})
    const [display, setDisplay] = useState<Record<string, string>>({})
    const [data, setData] = useState<Record<string, StokerRecord[]>>({})
    const [isLoading, setLoading] = useState<Record<string, boolean>>({})
    const [isLoadingImmediate, setLoadingImmediate] = useState<Record<string, boolean>>({})
    const [recordTitleField, setRecordTitleField] = useState<Record<string, string | undefined>>({})
    const [collectionTitle, setCollectionTitle] = useState<Record<string, string | undefined>>({})

    const preventChange = isRouteLoadingImmediate.has(location.pathname)

    const isArrayOrRelationFilter = useCallback(
        (filter: Filter): filter is SelectFilter | RelationFilter => {
            if (filter.type === "relation") return true
            if (filter.type === "select") {
                const fieldSchema = getField(fields, filter.field)
                return fieldSchema.type === "Array"
            }
            return false
        },
        [fields],
    )

    const isIncludeAssignedActive = useCallback(() => {
        if (!isAssigning || !assignable?.includeAssignedInFilters?.length) return false
        return assignable.includeAssignedInFilters.some((field) =>
            filters.some((filter) => filter.type === "select" && filter.field === field && filter.value),
        )
    }, [isAssigning, assignable, filters])

    const isMobile = useIsMobile()
    const someFilterOpen = Object.values(open).some(Boolean)
    const { offset: keyboardOffset, viewportHeight } = useKeyboardOffset(isMobile && someFilterOpen)
    const sheetHeight = Math.max(240, Math.min(viewportHeight - 16, viewportHeight * 0.9))

    const hasRelationFilterAccess = useCallback((filter: Filter) => {
        if (filter.type === "status" || filter.type === "range") return false
        const field = getField(fields, filter.field)
        if (!field || !isRelationField(field)) return false
        const relationCollection = schema.collections[field.collection]
        if (!relationCollection) return false
        const collectionPermissions = permissions?.collections?.[relationCollection.labels.collection]
        const fullCollectionAccess = collectionPermissions && collectionAccess("Read", collectionPermissions)
        const dependencyAccess = hasDependencyAccess(relationCollection, schema, permissions)
        if (!fullCollectionAccess && dependencyAccess.length === 0) return false
        if (relationList && relationList.field === filter.field) return false
        return true
    }, [])

    useEffect(() => {
        const initialize = async () => {
            for (const filter of filters) {
                if (filter.type === "relation") {
                    if (!hasRelationFilterAccess(filter)) continue
                    const field = getField(fields, filter.field)
                    if (!field || !isRelationField(field)) continue
                    const relationCollection = schema.collections[field.collection]
                    const relationCustomization = getCollectionConfigModule(relationCollection.labels.collection)

                    const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                        "collections",
                        field.collection,
                        "admin",
                    ]

                    setRecordTitleField((prev) => ({
                        ...prev,
                        [filter.field]: relationCollection.recordTitleField,
                    }))
                    const collectionTitle = (await getCachedConfigValue(relationCustomization, [
                        ...collectionAdminPath,
                        "titles",
                        "collection",
                    ])) as string | undefined
                    setCollectionTitle((prev) => ({
                        ...prev,
                        [filter.field]: collectionTitle || relationCollection.labels.collection,
                    }))

                    if (filter.value) {
                        setValue((prev) => ({
                            ...prev,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            [filter.field]: filter.value!,
                        }))
                        // TODO: subcollection support
                        getOne([field.collection], filter.value).then((record) => {
                            setDisplay((prev) => ({
                                ...prev,
                                [filter.field]: record[relationCollection.recordTitleField || "id"],
                            }))
                        })
                    }
                } else if (filter.type === "select") {
                    setValue((prev) => ({
                        ...prev,
                        [filter.field]: filter.value?.toString() || "no_selection",
                    }))
                }
            }
        }
        initialize()
    }, [])

    useEffect(() => {
        if (isPreloadCacheEnabled) return

        let arrayOrRelationField: string | undefined

        if (isIncludeAssignedActive()) {
            const activeField = assignable?.includeAssignedInFilters?.find((field) =>
                filters.some((filter) => filter.type === "select" && filter.field === field && filter.value),
            )
            if (activeField) {
                arrayOrRelationField = activeField
            }
        }

        const arrayOrRelationFilter = filters.find(
            (filter): filter is SelectFilter | RelationFilter => !!filter.value && isArrayOrRelationFilter(filter),
        )
        if (arrayOrRelationFilter) {
            arrayOrRelationField = arrayOrRelationFilter.field
        }
        setArrayContainsFilterSet(arrayOrRelationField)
    }, [filters, isAssigning, assignable, isPreloadCacheEnabled, isIncludeAssignedActive, isArrayOrRelationFilter])

    const handleChange = useCallback(
        (filter: Filter, value: string, type: CollectionField["type"]) => {
            if (preventChange) return
            if (filter.type === "range" || filter.type === "status") return
            const index = filters
                .filter((filterItem) => filterItem.type !== "status" && filterItem.type !== "range")
                .findIndex((filterItem) => filter.field === filterItem.field)
            let newFilters: Filter[] = []
            if (value !== "no_selection") {
                setFilters((filters) => {
                    newFilters = [...filters]
                    if (type === "Number") {
                        // eslint-disable-next-line security/detect-object-injection
                        newFilters[index].value = Number(value)
                    } else {
                        // eslint-disable-next-line security/detect-object-injection
                        newFilters[index].value = value
                    }
                    return newFilters
                })
            } else {
                setFilters((filters) => {
                    newFilters = [...filters]
                    // eslint-disable-next-line security/detect-object-injection
                    delete newFilters[index].value
                    return newFilters
                })
            }
            const filterParam = newFilters
                .filter((filter: Filter) => filter.type !== "status" && filter.type !== "range" && filter.value)
                .map((filter: Filter) => {
                    if (filter.type !== "status" && filter.type !== "range" && filter.value) {
                        return `${filter.field}=${filter.value.toString()}`
                    }
                    return ""
                })

            if (!relationList) {
                if (filterParam.length > 0) {
                    setState(`collection-filters-${labels.collection.toLowerCase()}`, "filters", filterParam.join(","))
                } else {
                    setState(`collection-filters-${labels.collection.toLowerCase()}`, "filters", "DELETE_STATE")
                }
            }
        },
        [preventChange],
    )

    const pickerDebounceTimeout = useRef<NodeJS.Timeout>()

    const getData = useCallback(
        async (
            query: string | undefined,
            field: string,
            collection: StokerCollection,
            constraints: [string, "==" | "in", unknown][] = [],
        ) => {
            // eslint-disable-next-line security/detect-object-injection
            const collectionSchema = schema.collections[collection]
            const { fullTextSearch, softDelete } = collectionSchema
            const isCollectionPreloadCacheEnabled = preloadCacheEnabled(collectionSchema)
            const isCollectionServerReadOnly = serverReadOnly(collectionSchema)

            setLoadingImmediate((prev) => ({
                ...prev,
                [field]: true,
            }))

            clearTimeout(pickerDebounceTimeout.current)

            setLoading((prev) => ({
                ...prev,
                [field]: false,
            }))

            pickerDebounceTimeout.current = setTimeout(() => {
                setLoading((prev) => ({
                    ...prev,
                    [field]: true,
                }))
            }, 500)

            let newConstraints: QueryConstraint[] | [string, string, unknown][] = []
            if (isCollectionServerReadOnly) {
                newConstraints = constraints
            } else {
                newConstraints = constraints.map((constraint) => where(constraint[0], constraint[1], constraint[2]))
            }
            if (isCollectionServerReadOnly) {
                if (softDelete?.archivedField) {
                    newConstraints.push([softDelete.archivedField, "==", false] as QueryConstraint &
                        [string, string, unknown])
                }
            } else {
                if (softDelete?.archivedField) {
                    newConstraints.push(
                        where(softDelete.archivedField, "==", false) as QueryConstraint & [string, string, unknown],
                    )
                }
            }

            let searchObjectIDs: string[] | undefined
            if (fullTextSearch && !isCollectionPreloadCacheEnabled && !isCollectionServerReadOnly && query) {
                const disjunctions = getFilterDisjunctions(collectionSchema)
                const hitsPerPage = disjunctions === 0 ? 10 : Math.min(10, Math.max(1, Math.floor(30 / disjunctions)))
                const objectIDs = await performFullTextSearch(collectionSchema, query, hitsPerPage, constraints)
                searchObjectIDs = objectIDs
                if (objectIDs.length > 0) {
                    if (isCollectionServerReadOnly) {
                        newConstraints.push(["id", "in", objectIDs] as QueryConstraint & [string, string, unknown])
                    } else {
                        newConstraints.push(where("id", "in", objectIDs) as QueryConstraint & [string, string, unknown])
                    }
                } else if (query) {
                    clearTimeout(pickerDebounceTimeout.current)
                    setData((prev) => ({
                        ...prev,
                        [field]: [],
                    }))
                    setLoadingImmediate((prev) => ({
                        ...prev,
                        [field]: false,
                    }))
                    setLoading((prev) => ({
                        ...prev,
                        [field]: false,
                    }))
                    return
                }
            }

            // TODO: subcollection support
            getSome([collection], {
                constraints: newConstraints as QueryConstraint[] | [string, WhereFilterOp, unknown][],
                only: isCollectionPreloadCacheEnabled ? "cache" : undefined,
                pagination:
                    isCollectionPreloadCacheEnabled || (isCollectionServerReadOnly && query)
                        ? undefined
                        : { number: 10 },
                noEmbeddingFields: true,
            }).then((data) => {
                clearTimeout(pickerDebounceTimeout.current)

                const numberOfResults = isCollectionPreloadCacheEnabled && isMobile ? 20 : 10
                if ((isCollectionPreloadCacheEnabled || isCollectionServerReadOnly) && query) {
                    const searchResults = localFullTextSearch(collectionSchema, query, data.records)
                    const recordsById = new Map(data.records.map((doc) => [doc.id, doc]))
                    const ordered = searchResults
                        .map((result) => recordsById.get(result.id))
                        .filter((doc): doc is StokerRecord => !!doc)
                        .slice(0, numberOfResults)
                    setData((prev) => ({
                        ...prev,
                        [field]: ordered,
                    }))
                } else if (query && searchObjectIDs) {
                    const recordsById = new Map(data.records.map((doc) => [doc.id, doc]))
                    const ordered = searchObjectIDs
                        .map((id) => recordsById.get(id))
                        .filter((doc): doc is StokerRecord => !!doc)
                        .slice(0, numberOfResults)
                    setData((prev) => ({
                        ...prev,
                        [field]: ordered,
                    }))
                } else {
                    setData((prev) => ({
                        ...prev,
                        [field]: data.records.slice(0, numberOfResults),
                    }))
                }
                setLoadingImmediate((prev) => ({
                    ...prev,
                    [field]: false,
                }))
                setLoading((prev) => ({
                    ...prev,
                    [field]: false,
                }))
            })
        },
        [isMobile],
    )

    const debounceTimeout = useRef<NodeJS.Timeout>()

    useEffect(() => {
        for (const filter of filters) {
            if (filter.type === "relation") {
                const field = getField(fields, filter.field)
                if (!field || !isRelationField(field)) continue
                const relationCollection = schema.collections[field.collection]
                if (!relationCollection?.fullTextSearch) continue
                const isCollectionPreloadCacheEnabled = preloadCacheEnabled(relationCollection)
                if (searchValue[filter.field] !== prevSearchValue[filter.field]) {
                    if (debounceTimeout.current) {
                        clearTimeout(debounceTimeout.current)
                    }
                    debounceTimeout.current = setTimeout(
                        () => {
                            startTransition(() => {
                                getData(searchValue[filter.field], filter.field, field.collection, filter.constraints)
                            })
                        },
                        isCollectionPreloadCacheEnabled ? 250 : 750,
                    )
                }
            }
        }
        setPrevSearchValue(searchValue)
    }, [searchValue])

    const isFilterDisabled = useCallback(
        (filter: Filter) => {
            if (filter.type === "range" || filter.type === "status") return false
            return isRouteLoading.has(location.pathname)
        },
        [isRouteLoading, location.pathname],
    )

    const isFilterInactive = useCallback(
        (filter: Filter) => {
            if (filter.type === "range" || filter.type === "status") return false
            const fieldSchema = getField(fields, filter.field)
            return !!(
                (!isPreloadCacheEnabled &&
                    arrayContainsFilterSet &&
                    arrayContainsFilterSet !== filter.field &&
                    (filter.type === "relation" ||
                        fieldSchema.type === "Array" ||
                        (isAssigning && assignable?.includeAssignedInFilters?.includes(filter.field)))) ||
                (isRelationField(fieldSchema) &&
                    connectionStatus === "offline" &&
                    !preloadCacheEnabled(schema.collections[fieldSchema.collection]))
            )
        },
        [isPreloadCacheEnabled, arrayContainsFilterSet, isRouteLoading, location.pathname, fields],
    )

    return (
        <div className="flex flex-col gap-6">
            {filters.map((filter: Filter) => {
                if (
                    "condition" in filter &&
                    filter.condition &&
                    filter.condition(relationCollection, relationParent, isAssigning) === false
                )
                    return null
                if (filter.type === "relation" && !hasRelationFilterAccess(filter)) return
                if (filter.type === "status" || filter.type === "range") return
                const field = getField(fields, filter.field)
                if (!field) return null
                const fieldCustomization = getFieldCustomization(field, customization)
                const label = tryFunction(fieldCustomization.admin?.label)
                const disabled = isFilterDisabled(filter) || isFilterInactive(filter)
                if (excluded.includes(filter.field)) return null
                if (filter.type === "select") {
                    const title = tryFunction(filter.title) || label || field.name
                    let values
                    if ("values" in field) {
                        values = field.values
                        if (values && field.type === "Number") {
                            values = values.map((value) => value.toString())
                        }
                    }
                    if (field.type === "Boolean") {
                        values = [title, `Not ${title}`]
                    }
                    if (!values) return
                    if (!permissions?.Role || (filter.roles && !filter.roles.includes(permissions.Role))) return
                    if (filter.style === "radio") {
                        return (
                            <div key={filter.field}>
                                <Label htmlFor={title}>{title}:</Label>
                                <RadioGroup defaultValue="no_selection" className="mt-2">
                                    {values.map((value: string) => {
                                        if (filter.filterValues && filter.filterValues(value) === false) return null
                                        return (
                                            <div key={value} className="flex items-center space-x-2">
                                                <RadioGroupItem
                                                    value={value}
                                                    id={value}
                                                    // eslint-disable-next-line security/detect-object-injection
                                                    checked={inputValue[filter.field] === value}
                                                    disabled={disabled}
                                                    onClick={() => {
                                                        setValue((prev) => ({
                                                            ...prev,
                                                            [filter.field]: value,
                                                        }))
                                                        startTransition(() => {
                                                            handleChange(filter, value, field.type)
                                                        })
                                                    }}
                                                />
                                                <Label htmlFor={value}>{value}</Label>
                                            </div>
                                        )
                                    })}
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem
                                            value="no_selection"
                                            id="no_selection"
                                            // eslint-disable-next-line security/detect-object-injection
                                            checked={inputValue[filter.field] === "no_selection"}
                                            disabled={disabled}
                                            onClick={() => {
                                                setValue((prev) => ({
                                                    ...prev,
                                                    [filter.field]: "no_selection",
                                                }))
                                                startTransition(() => {
                                                    handleChange(filter, "no_selection", field.type)
                                                })
                                            }}
                                        />
                                        <Label htmlFor="no_selection">All</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        )
                    } else if (filter.style === "buttons") {
                        return (
                            <div key={filter.field}>
                                <Label htmlFor={title}>{title}:</Label>
                                <div className="mt-2 flex flex-col gap-2">
                                    {values.map((value: string) => {
                                        if (filter.filterValues && filter.filterValues(value) === false) return null
                                        return (
                                            <Button
                                                key={value}
                                                // eslint-disable-next-line security/detect-object-injection
                                                variant={inputValue[filter.field] === value ? "default" : "outline"}
                                                disabled={disabled}
                                                onClick={() => {
                                                    setValue((prev) => ({
                                                        ...prev,
                                                        [filter.field]: value,
                                                    }))
                                                    startTransition(() => {
                                                        handleChange(filter, value, field.type)
                                                    })
                                                }}
                                                className={cn(
                                                    "disabled:opacity-100",
                                                    isFilterInactive(filter) && "disabled:opacity-50",
                                                )}
                                            >
                                                {value}
                                            </Button>
                                        )
                                    })}
                                    <Button
                                        // eslint-disable-next-line security/detect-object-injection
                                        variant={inputValue[filter.field] === "no_selection" ? "default" : "outline"}
                                        disabled={disabled}
                                        onClick={() => {
                                            setValue((prev) => ({
                                                ...prev,
                                                [filter.field]: "no_selection",
                                            }))
                                            startTransition(() => {
                                                handleChange(filter, "no_selection", field.type)
                                            })
                                        }}
                                        className={cn(
                                            "disabled:opacity-100",
                                            isFilterInactive(filter) && "disabled:opacity-50",
                                        )}
                                    >
                                        All
                                    </Button>
                                </div>
                            </div>
                        )
                    } else {
                        return (
                            <div key={filter.field}>
                                <Label htmlFor={title}>{title}:</Label>
                                <div className="mt-2">
                                    <Select
                                        disabled={disabled}
                                        // eslint-disable-next-line security/detect-object-injection
                                        value={inputValue[filter.field] || "no_selection"}
                                        onValueChange={(value) => {
                                            setValue((prev) => {
                                                return {
                                                    ...prev,
                                                    [filter.field]: value,
                                                }
                                            })
                                            startTransition(() => {
                                                handleChange(filter, value, field.type)
                                            })
                                        }}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="no_selection">----</SelectItem>
                                            {values.map((value: string) => {
                                                if (filter.filterValues && filter.filterValues(value) === false) return
                                                return (
                                                    <SelectItem key={value} value={value}>
                                                        {value}
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )
                    }
                }
                /* eslint-disable security/detect-object-injection */
                if (filter.type === "relation" && isRelationField(field)) {
                    const title = tryFunction(filter.title) || label || field.name
                    const relationCollection = schema.collections[field.collection]
                    if (!permissions?.Role || (filter.roles && !filter.roles.includes(permissions.Role))) return
                    if (!relationCollection.fullTextSearch) return null
                    const isCollectionPreloadCacheEnabled = preloadCacheEnabled(relationCollection)
                    let popoverHeight = "h-auto"
                    if (window.innerHeight < 600) {
                        popoverHeight = "h-48"
                    }
                    const isFilterOpen = !!open[filter.field]
                    const handleFilterOpenChange = (nextOpen: boolean) => {
                        setOpen((prev) => ({ ...prev, [filter.field]: nextOpen }))
                        if (nextOpen) {
                            startTransition(() => {
                                getData(searchValue[filter.field], filter.field, field.collection, filter.constraints)
                            })
                        }
                    }
                    const filterTriggerButton = (
                        <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={isFilterOpen}
                            className="w-full justify-between"
                            disabled={disabled}
                        >
                            <span className="w-[150px] sm:w-[250px] overflow-hidden text-ellipsis whitespace-nowrap text-left">
                                {inputValue[filter.field] ? display[filter.field] : "----"}
                            </span>
                            <ChevronsUpDown className="opacity-50 h-4 w-4" />
                        </Button>
                    )
                    const filterCommandBody = (
                        <Command
                            filter={() => {
                                return 1
                            }}
                            className={isMobile ? "flex flex-col h-full" : undefined}
                        >
                            <CommandInput
                                placeholder={`Search ${collectionTitle[filter.field]}...`}
                                className="h-9"
                                value={searchValue[filter.field]}
                                onValueChange={(value) => {
                                    setSearchValue((prev) => ({
                                        ...prev,
                                        [filter.field]: value,
                                    }))
                                }}
                            />
                            <CommandList className={isMobile ? "flex-1 max-h-none" : undefined}>
                                <CommandEmpty>
                                    {isFilterOpen &&
                                        (isLoading[filter.field] ? (
                                            <LoadingSpinner size={7} className="m-auto" />
                                        ) : !isLoadingImmediate[filter.field] ? (
                                            `No ${collectionTitle[filter.field]} found.`
                                        ) : null)}
                                </CommandEmpty>
                                {(!isLoading[filter.field] || isCollectionPreloadCacheEnabled) && (
                                    <CommandGroup>
                                        {data[filter.field] && (
                                            <CommandItem
                                                className={cn(isMobile ? "p-3" : undefined)}
                                                key="no_selection"
                                                value="no_selection"
                                                onSelect={(currentValue) => {
                                                    setOpen((prev) => {
                                                        return {
                                                            ...prev,
                                                            [filter.field]: false,
                                                        }
                                                    })
                                                    if (currentValue !== inputValue[filter.field]) {
                                                        setValue((prev) => {
                                                            return {
                                                                ...prev,
                                                                [filter.field]: currentValue,
                                                            }
                                                        })
                                                        setDisplay((prev) => {
                                                            return {
                                                                ...prev,
                                                                [filter.field]: "----",
                                                            }
                                                        })
                                                        startTransition(() => {
                                                            handleChange(filter, "no_selection", field.type)
                                                        })
                                                    }
                                                }}
                                            >
                                                ----
                                            </CommandItem>
                                        )}
                                        {data[filter.field]?.map((record: StokerRecord) => (
                                            <CommandItem
                                                className={cn(isMobile ? "p-3" : undefined)}
                                                key={record.id}
                                                value={record.id}
                                                onSelect={(currentValue) => {
                                                    setOpen((prev) => {
                                                        return {
                                                            ...prev,
                                                            [filter.field]: false,
                                                        }
                                                    })
                                                    if (currentValue !== inputValue[filter.field]) {
                                                        setValue((prev) => {
                                                            return {
                                                                ...prev,
                                                                [filter.field]: currentValue,
                                                            }
                                                        })
                                                        setDisplay((prev) => {
                                                            return {
                                                                ...prev,
                                                                [filter.field]:
                                                                    record[recordTitleField[filter.field] || "id"],
                                                            }
                                                        })
                                                        startTransition(() => {
                                                            handleChange(filter, record.id, field.type)
                                                        })
                                                    }
                                                }}
                                            >
                                                {record[recordTitleField[filter.field] || "id"]}
                                                <Check
                                                    className={cn(
                                                        "ml-auto",
                                                        inputValue[filter.field] === record.id
                                                            ? "opacity-100"
                                                            : "opacity-0",
                                                    )}
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                )}
                            </CommandList>
                        </Command>
                    )
                    return (
                        <div key={filter.field}>
                            <Label htmlFor={title}>{title}:</Label>
                            <div className="mt-2">
                                {isMobile ? (
                                    <Sheet open={isFilterOpen} onOpenChange={handleFilterOpenChange}>
                                        <SheetTrigger asChild>{filterTriggerButton}</SheetTrigger>
                                        <SheetContent
                                            side="bottom"
                                            className="p-0 pt-8 flex flex-col gap-0 rounded-t-lg"
                                            style={{
                                                bottom: keyboardOffset,
                                                height: sheetHeight,
                                                maxHeight: sheetHeight,
                                            }}
                                            onOpenAutoFocus={(event) => {
                                                event.preventDefault()
                                            }}
                                        >
                                            {filterCommandBody}
                                        </SheetContent>
                                    </Sheet>
                                ) : (
                                    <Popover modal={true} open={isFilterOpen} onOpenChange={handleFilterOpenChange}>
                                        <PopoverTrigger asChild>{filterTriggerButton}</PopoverTrigger>
                                        <PopoverContent
                                            className={cn(popoverHeight, "w-[200px]", "sm:w-[280px]", "p-0", "h-60")}
                                            align="start"
                                        >
                                            {filterCommandBody}
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        </div>
                    )
                }
                return null
                /* eslint-enable security/detect-object-injection */
            })}
            {filters.filter(
                (filter) =>
                    filter.type !== "status" &&
                    filter.type !== "range" &&
                    getField(fields, filter.field) &&
                    !(filter.type === "relation" && !hasRelationFilterAccess(filter)) &&
                    !(!permissions?.Role || (filter.roles && !filter.roles.includes(permissions.Role))),
            ).length > 0 && (
                <Button
                    variant="outline"
                    disabled={isRouteLoading.has(location.pathname)}
                    onClick={() => {
                        filters.forEach((filter) => {
                            if (filter.type === "status" || filter.type === "range") return
                            if (relationList && relationList.field === filter.field) return
                            if (
                                "condition" in filter &&
                                filter.condition &&
                                !filter.condition(relationCollection, relationParent, isAssigning)
                            )
                                return
                            if (isSidebar && !relationList?.showFilters?.includes(filter.field)) return
                            const field = getField(fields, filter.field)
                            if (!field) return
                            if (filter.type === "select") {
                                setValue((prev) => ({
                                    ...prev,
                                    [filter.field]: "no_selection",
                                }))
                                startTransition(() => {
                                    handleChange(filter, "no_selection", field.type)
                                })
                            }
                            if (filter.type === "relation") {
                                setValue((prev) => ({
                                    ...prev,
                                    [filter.field]: "no_selection",
                                }))
                                setDisplay((prev) => ({
                                    ...prev,
                                    [filter.field]: "----",
                                }))
                                startTransition(() => {
                                    handleChange(filter, "no_selection", field.type)
                                })
                            }
                        })
                    }}
                >
                    Clear Filters
                </Button>
            )}
        </div>
    )
}

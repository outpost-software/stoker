import {
    CollectionSchema,
    StokerCollection,
    StokerRecord,
    StokerRelation,
    StokerRelationObject,
    ParentPropertyEntityRestriction,
} from "@stoker-platform/types"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { serverReadOnly } from "./utils/serverReadOnly"
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { QueryConstraint, where, WhereFilterOp } from "firebase/firestore"
import { getFilterDisjunctions } from "./utils/getFilterDisjunctions"
import { performFullTextSearch } from "./utils/performFullTextSearch"
import { localFullTextSearch } from "./utils/localFullTextSearch"
import { getOne, getSome } from "@stoker-platform/web-client"
import { FormControl, FormItem, FormLabel } from "./components/ui/form"
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover"
import { Button } from "./components/ui/button"
import { Check, ChevronsUpDown, Plus, XCircle } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./components/ui/command"
import { cn } from "./lib/utils"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { UseFormReturn } from "react-hook-form"
import { Checkbox } from "./components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { getField } from "@stoker-platform/utils"

export const PermissionPicker = ({
    type,
    form,
    mainCollection,
    collection,
    title,
    constraints,
    isDisabled,
    hasUser,
    formResetKey,
    formSavedKey,
    restriction,
}: {
    type: "Individual" | "Parent" | "Parent_Property"
    form: UseFormReturn
    mainCollection: CollectionSchema
    collection: CollectionSchema
    title: StokerCollection
    constraints: [string, "==" | "in", unknown][]
    isDisabled: boolean
    hasUser: boolean
    formResetKey?: number
    formSavedKey?: number
    restriction?: ParentPropertyEntityRestriction
}) => {
    const { labels, fullTextSearch, softDelete, recordTitleField } = collection

    const isCollectionPreloadCacheEnabled = preloadCacheEnabled(collection)
    const isCollectionServerReadOnly = serverReadOnly(collection)

    const [isOpen, setIsOpen] = useState(false)
    const [searchValue, setSearchValue] = useState("")
    const [prevSearchValue, setPrevSearchValue] = useState<string>("")
    const [inputValue, setValue] = useState("")
    const [display, setDisplay] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingImmediate, setIsLoadingImmediate] = useState(false)
    const [data, setData] = useState<StokerRecord[]>([])
    const [selectedProperties, setSelectedProperties] = useState<Record<string, string[]>>({})
    const [originalSelectedProperties, setOriginalSelectedProperties] = useState<Record<string, string[]>>({})
    const [selectedEntities, setSelectedEntities] = useState<Array<{ id: string; display: string }>>([])
    const [originalSelectedEntities, setOriginalSelectedEntities] = useState<Array<{ id: string; display: string }>>([])

    const pickerDebounceTimeout = useRef<NodeJS.Timeout>()

    const getData = useCallback(
        async (query: string | undefined, constraints: [string, "==" | "in", unknown][] = []) => {
            setIsLoadingImmediate(true)

            clearTimeout(pickerDebounceTimeout.current)

            setIsLoading(false)

            pickerDebounceTimeout.current = setTimeout(() => {
                setIsLoading(true)
            }, 500)

            let newConstraints: QueryConstraint[] | [string, WhereFilterOp, unknown][] = []
            if (isCollectionServerReadOnly) {
                newConstraints = constraints
            } else {
                newConstraints = constraints.map((constraint) => where(constraint[0], constraint[1], constraint[2]))
            }
            if (isCollectionServerReadOnly) {
                if (softDelete) {
                    newConstraints.push(["Archived", "==", false] as QueryConstraint & [string, WhereFilterOp, unknown])
                }
            } else {
                if (softDelete) {
                    newConstraints.push(
                        where("Archived", "==", false) as QueryConstraint & [string, WhereFilterOp, unknown],
                    )
                }
            }

            if (fullTextSearch && !isCollectionPreloadCacheEnabled && query) {
                const disjunctions = getFilterDisjunctions(collection)
                const hitsPerPage = disjunctions === 0 ? 10 : Math.min(10, Math.max(1, Math.floor(30 / disjunctions)))
                const objectIDs = await performFullTextSearch(collection, query, hitsPerPage, constraints)
                if (objectIDs.length > 0) {
                    if (isCollectionServerReadOnly) {
                        newConstraints.push(["id", "in", objectIDs] as QueryConstraint &
                            [string, WhereFilterOp, unknown])
                    } else {
                        newConstraints.push(
                            where("id", "in", objectIDs) as QueryConstraint & [string, WhereFilterOp, unknown],
                        )
                    }
                } else if (query) {
                    clearTimeout(pickerDebounceTimeout.current)
                    setData([])
                    setIsLoadingImmediate(false)
                    setIsLoading(false)
                    return
                }
            }

            // TODO: subcollection support
            getSome([labels.collection], newConstraints, {
                only: isCollectionPreloadCacheEnabled ? "cache" : undefined,
                pagination: isCollectionPreloadCacheEnabled ? undefined : { number: 10 },
                noEmbeddingFields: true,
            }).then((data) => {
                clearTimeout(pickerDebounceTimeout.current)

                if (isCollectionPreloadCacheEnabled && query) {
                    const searchResults = localFullTextSearch(collection, query, data.docs)
                    const objectIds = searchResults.map((result) => result.id)
                    setData(data.docs.filter((doc) => objectIds.includes(doc.id)).slice(0, 10))
                } else {
                    setData(data.docs.slice(0, 10))
                }
                setIsLoadingImmediate(false)
                setIsLoading(false)
            })
        },
        [],
    )

    const debounceTimeout = useRef<NodeJS.Timeout>()

    useEffect(() => {
        if (!fullTextSearch) return
        const isCollectionPreloadCacheEnabled = preloadCacheEnabled(collection)
        if (searchValue !== prevSearchValue) {
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current)
            }
            debounceTimeout.current = setTimeout(
                () => {
                    startTransition(() => {
                        getData(searchValue, constraints)
                    })
                },
                isCollectionPreloadCacheEnabled ? 250 : 750,
            )
        }
        setPrevSearchValue(searchValue)
    }, [searchValue])

    const handleChange = useCallback(async () => {
        let relation = data?.find((record) => record.id === inputValue)
        if (!relation) {
            // TODO: subcollection support
            relation = await getOne([labels.collection], inputValue, { noEmbeddingFields: true })
        }
        form.setValue(`accessible-${mainCollection.labels.collection}-${collection.labels.collection}`, {
            ...form.getValues(`accessible-${mainCollection.labels.collection}-${collection.labels.collection}`),
            [inputValue]: relation,
        })
    }, [inputValue, data])

    const availableProperties = useMemo(() => {
        if (!restriction) return []
        const propertyField = getField(mainCollection.fields, restriction.propertyField)
        if (propertyField && "values" in propertyField) {
            return propertyField.values?.map(String) || []
        }
        return []
    }, [])

    const handleAddEntity = useCallback(async () => {
        if (!inputValue || inputValue === "no_selection") return

        let relation = data?.find((record) => record.id === inputValue)
        if (!relation) {
            // TODO: subcollection support
            relation = await getOne([labels.collection], inputValue, { noEmbeddingFields: true })
        }

        const entityDisplay = relation[recordTitleField || "id"]
        const isAlreadySelected = selectedEntities.some((entity) => entity.id === inputValue)

        if (!isAlreadySelected) {
            setSelectedEntities((prev) => [...prev, { id: inputValue, display: entityDisplay }])
            // eslint-disable-next-line security/detect-object-injection
            if (!selectedProperties[inputValue]) {
                setSelectedProperties((prev) => ({
                    ...prev,
                    [inputValue]: [],
                }))
            }
        }

        setValue("")
        setDisplay("")
    }, [inputValue, data, selectedEntities, selectedProperties])

    const saveFormData = useCallback(() => {
        const formData: Record<string, string[]> = {}
        selectedEntities.forEach((entity) => {
            const properties = selectedProperties[entity.id] || []
            properties.forEach((property) => {
                // eslint-disable-next-line security/detect-object-injection
                if (!formData[property]) {
                    // eslint-disable-next-line security/detect-object-injection
                    formData[property] = []
                }
                // eslint-disable-next-line security/detect-object-injection
                formData[property].push(entity.id)
            })
        })

        form.setValue(`accessible-${mainCollection.labels.collection}-${collection.labels.collection}`, formData, {
            shouldDirty: true,
        })
    }, [selectedEntities, selectedProperties, form])

    useEffect(() => {
        if (type === "Parent_Property" && selectedEntities.length > 0) {
            saveFormData()
        }
    }, [selectedEntities, selectedProperties, hasUser])

    const handlePropertyToggle = useCallback((entityId: string, property: string, checked: boolean) => {
        setSelectedProperties((prev) => {
            // eslint-disable-next-line security/detect-object-injection
            const currentProperties = prev[entityId] || []
            const newProperties = checked
                ? [...currentProperties, property]
                : currentProperties.filter((currentProperty) => currentProperty !== property)

            return {
                ...prev,
                [entityId]: newProperties,
            }
        })
        if (hasUser) {
            form.setValue("operation", "update")
        } else {
            form.setValue("operation", "create")
        }
    }, [])

    useEffect(() => {
        setSelectedEntities(originalSelectedEntities)
        setSelectedProperties(originalSelectedProperties)
    }, [formResetKey])

    useEffect(() => {
        setOriginalSelectedEntities(selectedEntities)
        setOriginalSelectedProperties(selectedProperties)
    }, [formSavedKey])

    useEffect(() => {
        if (type === "Parent_Property") {
            const existingData =
                (form.getValues(
                    `accessible-${mainCollection.labels.collection}-${collection.labels.collection}`,
                ) as Record<string, string[]>) || {}

            const uiFormatData: Record<string, string[]> = {}
            const entityIdsSet = new Set<string>()

            Object.entries(existingData).forEach(([property, entityIdsArray]) => {
                entityIdsArray.forEach((entityId) => {
                    entityIdsSet.add(entityId)
                    // eslint-disable-next-line security/detect-object-injection
                    if (!uiFormatData[entityId]) {
                        // eslint-disable-next-line security/detect-object-injection
                        uiFormatData[entityId] = []
                    }
                    // eslint-disable-next-line security/detect-object-injection
                    uiFormatData[entityId].push(property)
                })
            })

            setSelectedProperties(uiFormatData)
            setOriginalSelectedProperties(uiFormatData)

            const loadExistingEntities = async () => {
                const entities: Array<{ id: string; display: string }> = []
                for (const entityId of entityIdsSet) {
                    try {
                        const entityRecord = await getOne([collection.labels.collection], entityId, {
                            noEmbeddingFields: true,
                        })
                        entities.push({
                            id: entityId,
                            display: entityRecord[recordTitleField || "id"],
                        })
                    } catch {
                        entities.push({
                            id: entityId,
                            display: entityId,
                        })
                    }
                }
                setSelectedEntities(entities)
                setOriginalSelectedEntities(entities)
            }

            loadExistingEntities()
        }
    }, [form])

    let popoverHeight = "h-auto"
    if (window.innerHeight < 600) {
        popoverHeight = "h-48"
    }

    if (type === "Parent_Property" && restriction) {
        return (
            <div className="w-full max-w-[750px]">
                <FormItem>
                    <FormLabel>{`Accessible ${title}`}</FormLabel>
                    <FormControl>
                        <Popover
                            modal={true}
                            open={isOpen}
                            onOpenChange={() => {
                                setIsOpen(!isOpen)
                                startTransition(() => {
                                    getData(searchValue, constraints)
                                })
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={isOpen}
                                        className="w-full justify-between"
                                        disabled={isDisabled}
                                    >
                                        <span className="break-all whitespace-pre-wrap line-clamp-1 text-left">
                                            {inputValue ? display : ""}
                                        </span>
                                        <ChevronsUpDown className="opacity-50 h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                {
                                    <Button
                                        type="button"
                                        disabled={isDisabled || !inputValue || inputValue === "no_selection"}
                                        variant="outline"
                                        size="icon"
                                        onClick={() => {
                                            if (hasUser) {
                                                form.setValue("operation", "update")
                                            } else {
                                                form.setValue("operation", "create")
                                            }
                                            handleAddEntity()
                                        }}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                }
                            </div>
                            <PopoverContent
                                className={cn(popoverHeight, "w-[200px]", "sm:w-[280px]", "p-0", "h-60")}
                                align="start"
                            >
                                <Command
                                    filter={() => {
                                        return 1
                                    }}
                                >
                                    <CommandInput
                                        placeholder={`Search ${title}...`}
                                        className="h-9"
                                        value={searchValue}
                                        onValueChange={(value) => {
                                            setSearchValue(value)
                                        }}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {isOpen &&
                                                (isLoading ? (
                                                    <LoadingSpinner size={7} className="m-auto" />
                                                ) : !isLoadingImmediate ? (
                                                    `No ${title} found.`
                                                ) : null)}
                                        </CommandEmpty>
                                        {(!isLoading || isCollectionPreloadCacheEnabled) && (
                                            <CommandGroup>
                                                {data && (
                                                    <CommandItem
                                                        key="no_selection"
                                                        value="no_selection"
                                                        onSelect={(currentValue) => {
                                                            setIsOpen(false)
                                                            if (currentValue !== inputValue) {
                                                                setValue(currentValue)
                                                                setDisplay("----")
                                                            }
                                                        }}
                                                    >
                                                        ----
                                                    </CommandItem>
                                                )}
                                                {data?.map((record: StokerRecord) => (
                                                    <CommandItem
                                                        key={record.id}
                                                        value={record.id}
                                                        onSelect={(currentValue) => {
                                                            setIsOpen(false)
                                                            if (currentValue !== inputValue) {
                                                                setValue(currentValue)
                                                                setDisplay(record[recordTitleField || "id"])
                                                            }
                                                        }}
                                                    >
                                                        {record[recordTitleField || "id"]}
                                                        <Check
                                                            className={cn(
                                                                "ml-auto",
                                                                inputValue === record.id ? "opacity-100" : "opacity-0",
                                                            )}
                                                        />
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        )}
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </FormControl>
                </FormItem>
                {selectedEntities.map((entity) => (
                    <Card key={entity.id} className="mt-4">
                        <CardHeader className="py-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm">{entity.display}</CardTitle>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="p-1"
                                    onClick={() => {
                                        setSelectedEntities((prev) =>
                                            prev.filter((selectedEntity) => selectedEntity.id !== entity.id),
                                        )
                                        setSelectedProperties((prev) => {
                                            const newProps = { ...prev }
                                            delete newProps[entity.id]
                                            return newProps
                                        })
                                        if (hasUser) {
                                            form.setValue("operation", "update")
                                        } else {
                                            form.setValue("operation", "create")
                                        }
                                    }}
                                    disabled={isDisabled}
                                >
                                    <XCircle className="w-4 h-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {availableProperties?.length && (
                                    <div className="flex flex-row gap-4 flex-wrap justify-start">
                                        {availableProperties?.map((property) => (
                                            <div key={property} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`property-${entity.id}-${property}`}
                                                    // eslint-disable-next-line security/detect-object-injection
                                                    checked={selectedProperties[entity.id]?.includes(property) || false}
                                                    onCheckedChange={(checked) => {
                                                        handlePropertyToggle(entity.id, property, checked as boolean)
                                                    }}
                                                    disabled={isDisabled}
                                                />
                                                <label
                                                    htmlFor={`property-${entity.id}-${property}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                >
                                                    {property}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    return (
        <div className="w-full max-w-[750px]">
            <FormItem>
                <FormLabel>{`Accessible ${title}`}</FormLabel>
                <FormControl>
                    <Popover
                        modal={true}
                        open={isOpen}
                        onOpenChange={() => {
                            setIsOpen(!isOpen)
                            startTransition(() => {
                                getData(searchValue, constraints)
                            })
                        }}
                    >
                        <div className="flex items-center gap-2">
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={isOpen}
                                    className="w-full justify-between"
                                    disabled={isDisabled}
                                >
                                    <span className="break-all whitespace-pre-wrap line-clamp-1 text-left">
                                        {inputValue ? display : ""}
                                    </span>
                                    <ChevronsUpDown className="opacity-50 h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                            {
                                <Button
                                    type="button"
                                    disabled={isDisabled || !inputValue || inputValue === "no_selection"}
                                    variant="outline"
                                    size="icon"
                                    onClick={() => {
                                        if (hasUser) {
                                            form.setValue("operation", "update")
                                        } else {
                                            form.setValue("operation", "create")
                                        }
                                        handleChange()
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            }
                        </div>
                        <PopoverContent
                            className={cn(popoverHeight, "w-[200px]", "sm:w-[280px]", "p-0", "h-60")}
                            align="start"
                        >
                            <Command
                                filter={() => {
                                    return 1
                                }}
                            >
                                <CommandInput
                                    placeholder={`Search ${title}...`}
                                    className="h-9"
                                    value={searchValue}
                                    onValueChange={(value) => {
                                        setSearchValue(value)
                                    }}
                                />
                                <CommandList>
                                    <CommandEmpty>
                                        {isOpen &&
                                            (isLoading ? (
                                                <LoadingSpinner size={7} className="m-auto" />
                                            ) : !isLoadingImmediate ? (
                                                `No ${title} found.`
                                            ) : null)}
                                    </CommandEmpty>
                                    {(!isLoading || isCollectionPreloadCacheEnabled) && (
                                        <CommandGroup>
                                            {data && (
                                                <CommandItem
                                                    key="no_selection"
                                                    value="no_selection"
                                                    onSelect={(currentValue) => {
                                                        setIsOpen(false)
                                                        if (currentValue !== inputValue) {
                                                            setValue(currentValue)
                                                            setDisplay("----")
                                                        }
                                                    }}
                                                >
                                                    ----
                                                </CommandItem>
                                            )}
                                            {data?.map((record: StokerRecord) => (
                                                <CommandItem
                                                    key={record.id}
                                                    value={record.id}
                                                    onSelect={(currentValue) => {
                                                        setIsOpen(false)
                                                        if (currentValue !== inputValue) {
                                                            setValue(currentValue)
                                                            setDisplay(record[recordTitleField || "id"])
                                                        }
                                                    }}
                                                >
                                                    {record[recordTitleField || "id"]}
                                                    <Check
                                                        className={cn(
                                                            "ml-auto",
                                                            inputValue === record.id ? "opacity-100" : "opacity-0",
                                                        )}
                                                    />
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    )}
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </FormControl>
            </FormItem>
            <div className="mt-4">
                {form.getValues(`accessible-${mainCollection.labels.collection}-${collection.labels.collection}`) &&
                    Object.entries(
                        form.getValues(
                            `accessible-${mainCollection.labels.collection}-${collection.labels.collection}`,
                        ) as StokerRelationObject,
                    )?.map(([relationId, relation]: [string, StokerRelation], index: number) => {
                        return (
                            <div key={index} className="flex items-center gap-2">
                                <Button type="button" variant="link" className="px-0" disabled={isDisabled}>
                                    <span className="justify-between text-blue-500 max-w-[750px] break-all whitespace-pre-wrap line-clamp-1 text-ellipsis text-left">
                                        {relation[recordTitleField || "id"]}
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="p-1"
                                    onClick={() => {
                                        if (hasUser) {
                                            form.setValue("operation", "update")
                                        } else {
                                            form.setValue("operation", "create")
                                        }
                                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                        const { [relationId]: _, ...rest } = form.getValues(
                                            `accessible-${mainCollection.labels.collection}-${collection.labels.collection}`,
                                        ) as StokerRelation
                                        form.setValue(
                                            `accessible-${mainCollection.labels.collection}-${collection.labels.collection}`,
                                            rest,
                                        )
                                    }}
                                    disabled={isDisabled}
                                >
                                    <XCircle className="w-5 h-5" />
                                </Button>
                            </div>
                        )
                    })}
            </div>
        </div>
    )
}

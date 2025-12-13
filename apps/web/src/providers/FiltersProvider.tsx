import { getMaxDate, getMinDate } from "@/utils/getMaxDateRange"
import { preloadCacheEnabled } from "@/utils/preloadCacheEnabled"
import { serverReadOnly } from "@/utils/serverReadOnly"
import { CalendarConfig, CollectionSchema, Filter, StokerCollection, StokerRecord } from "@stoker-platform/types"
import { getCachedConfigValue, getField, getFieldCustomization, tryFunction } from "@stoker-platform/utils"
import { getCollectionConfigModule } from "@stoker-platform/web-client"
import { QueryConstraint, where, WhereFilterOp } from "firebase/firestore"
import { createContext, useCallback, useContext, useEffect, useState } from "react"

export const FiltersContext = createContext<
    | {
          filters: Filter[]
          setFilters: React.Dispatch<React.SetStateAction<Filter[]>>
          order: { field: string; direction: "asc" | "desc" } | undefined
          setOrder: React.Dispatch<React.SetStateAction<{ field: string; direction: "asc" | "desc" } | undefined>>
          getFilterConstraints: (
              filtersOverride?: Filter[],
              getAll?: boolean,
              server?: boolean,
          ) => QueryConstraint[] | [string, WhereFilterOp, unknown][]
          filterRecord: (record: StokerRecord) => boolean
      }
    | undefined
>(undefined)

interface FiltersProviderProps {
    collection: CollectionSchema
    children: React.ReactNode
}

/* eslint-disable react/prop-types */
export const FiltersProvider: React.FC<FiltersProviderProps> = ({ collection, children }) => {
    const { labels, fields, softDelete } = collection
    const [filters, setFilters] = useState<Filter[]>([])
    const [order, setOrder] = useState<{ field: string; direction: "asc" | "desc" }>()
    const [statusField, setStatusField] = useState<
        { field: string; active: unknown[]; archived: unknown[] } | undefined
    >(undefined)
    const [calendarConfig, setCalendarConfig] = useState<CalendarConfig | undefined>(undefined)
    const isServerReadOnly = serverReadOnly(collection)
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)
    const customization = getCollectionConfigModule(labels.collection)

    const softDeleteField = softDelete?.archivedField

    useEffect(() => {
        const initialize = async () => {
            const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                "collections",
                labels.collection,
                "admin",
            ]
            const statusField = await getCachedConfigValue(customization, [...collectionAdminPath, "statusField"])
            setStatusField(statusField)
            const calendarConfig = await getCachedConfigValue(customization, [...collectionAdminPath, "calendar"])
            setCalendarConfig(calendarConfig)
        }
        initialize()
    }, [])

    const getFilterConstraints = useCallback(
        (filtersOverride?: Filter[], getAll?: boolean, server?: boolean) => {
            const latestFilters = filtersOverride || filters
            if (!isServerReadOnly && !server) {
                const constraints: QueryConstraint[] = []
                latestFilters.forEach((filter) => {
                    if (!filter.value) return
                    if (filter.type === "status") {
                        if (!statusField && !softDeleteField) return
                        if (statusField && filter.value === "active") {
                            if (softDeleteField) {
                                constraints.push(where(softDeleteField, "==", false))
                            }
                            constraints.push(where(statusField.field, "in", statusField.active))
                        }
                        if (statusField && filter.value === "archived") {
                            if (softDeleteField) {
                                constraints.push(where(softDeleteField, "==", false))
                            }
                            constraints.push(where(statusField.field, "in", statusField.archived))
                        }
                        if (filter.value === "all") {
                            if (softDeleteField) {
                                constraints.push(where(softDeleteField, "==", false))
                            }
                        }
                        if (filter.value === "trash") {
                            if (softDeleteField) {
                                constraints.push(where(softDeleteField, "==", true))
                            }
                        }
                    }
                    if (filter.type === "range" && !getAll) {
                        if (filter.selector === "week" || filter.selector === "month") {
                            const range = JSON.parse(filter.value) as { from: string; to: string }
                            constraints.push(where(filter.field, ">=", new Date(range.from)))
                            constraints.push(where(filter.field, "<=", new Date(range.to)))
                        } else {
                            const range = JSON.parse(filter.value) as { from: string; to: string }
                            constraints.push(where(filter.field, ">=", new Date(range.from)))
                            constraints.push(where(filter.field, "<", new Date(range.to)))
                        }
                    }
                    if (filter.type === "select") {
                        const field = getField(fields, filter.field)
                        if (field.type === "Boolean") {
                            const fieldCustomization = getFieldCustomization(field, customization)
                            const label = tryFunction(fieldCustomization.admin?.label) || field.name
                            const title = tryFunction(filter.title) || label || field.name
                            constraints.push(where(filter.field, "==", filter.value === title))
                        } else if (field.type === "Array") {
                            constraints.push(where(filter.field, "array-contains", filter.value))
                        } else if (field.type === "Number") {
                            constraints.push(where(filter.field, "==", Number(filter.value)))
                        } else {
                            constraints.push(where(filter.field, "==", filter.value))
                        }
                    }
                    if (filter.type === "relation") {
                        const field = getField(fields, filter.field)
                        constraints.push(where(`${field.name}_Array`, "array-contains", filter.value))
                    }
                })
                if (!isPreloadCacheEnabled) {
                    const rangeFilter = latestFilters.find((filter) => filter.type === "range")
                    if ((!rangeFilter && calendarConfig) || (rangeFilter && getAll)) {
                        const rangeField = calendarConfig?.startField || rangeFilter?.field
                        if (rangeField) {
                            constraints.push(where(rangeField, ">=", getMinDate()))
                            constraints.push(where(rangeField, "<", getMaxDate()))
                        }
                    }
                }
                return constraints
            } else {
                const constraints: [string, WhereFilterOp, unknown][] = []
                latestFilters.forEach((filter) => {
                    if (!filter.value) return
                    if (filter.type === "status") {
                        if (!statusField && !softDeleteField) return
                        if (statusField && filter.value === "active") {
                            if (softDeleteField) {
                                constraints.push([softDeleteField, "==", false])
                            }
                            constraints.push([statusField.field, "in", statusField.active])
                        }
                        if (statusField && filter.value === "archived") {
                            if (softDeleteField) {
                                constraints.push([softDeleteField, "==", false])
                            }
                            constraints.push([statusField.field, "in", statusField.archived])
                        }
                        if (filter.value === "all") {
                            if (softDeleteField) {
                                constraints.push([softDeleteField, "==", false])
                            }
                        }
                        if (filter.value === "trash") {
                            if (softDeleteField) {
                                constraints.push([softDeleteField, "==", true])
                            }
                        }
                    }
                    if (filter.type === "range" && !getAll) {
                        if (filter.selector === "week" || filter.selector === "month") {
                            const range = JSON.parse(filter.value) as { from: string; to: string }
                            constraints.push([filter.field, ">=", new Date(range.from)])
                            constraints.push([filter.field, "<=", new Date(range.to)])
                        } else {
                            const range = JSON.parse(filter.value) as { from: string; to: string }
                            constraints.push([filter.field, ">=", new Date(range.from)])
                            constraints.push([filter.field, "<", new Date(range.to)])
                        }
                    }
                    if (filter.type === "select") {
                        const field = getField(fields, filter.field)
                        if (field.type === "Boolean") {
                            const fieldCustomization = getFieldCustomization(field, customization)
                            const label = tryFunction(fieldCustomization.admin?.label) || field.name
                            const title = tryFunction(filter.title) || label || field.name
                            constraints.push([filter.field, "==", filter.value === title])
                        } else if (field.type === "Array") {
                            constraints.push([filter.field, "array-contains", filter.value])
                        } else if (field.type === "Number") {
                            constraints.push([filter.field, "==", Number(filter.value)])
                        } else {
                            constraints.push([filter.field, "==", filter.value])
                        }
                    }
                    if (filter.type === "relation") {
                        const field = getField(fields, filter.field)
                        constraints.push([`${field.name}_Array`, "array-contains", filter.value])
                    }
                })
                if (!isPreloadCacheEnabled) {
                    const rangeFilter = latestFilters.find((filter) => filter.type === "range")
                    if ((!rangeFilter && calendarConfig) || (rangeFilter && getAll)) {
                        const rangeField = calendarConfig?.startField || rangeFilter?.field
                        if (rangeField) {
                            constraints.push([rangeField, ">=", getMinDate()])
                            constraints.push([rangeField, "<", getMaxDate()])
                        }
                    }
                }
                return constraints
            }
        },
        [filters, fields, isPreloadCacheEnabled, isServerReadOnly, statusField, softDeleteField],
    )

    const filterRecord = useCallback(
        (record: StokerRecord) => {
            let show = true
            filters.forEach((filter) => {
                if (!filter.value) return
                if (filter.type === "status") {
                    if (!statusField && !softDeleteField) return
                    if (statusField && filter.value === "active") {
                        if (softDeleteField) {
                            // eslint-disable-next-line security/detect-object-injection
                            show = show && record[softDeleteField] === false
                        }
                        show = show && statusField.active.includes(record[statusField.field])
                    }
                    if (statusField && filter.value === "archived") {
                        if (softDeleteField) {
                            // eslint-disable-next-line security/detect-object-injection
                            show = show && record[softDeleteField] === false
                        }
                        show = show && statusField.archived.includes(record[statusField.field])
                    }
                    if (filter.value === "all") {
                        if (softDeleteField) {
                            // eslint-disable-next-line security/detect-object-injection
                            show = show && record[softDeleteField] === false
                        }
                    }
                    if (filter.value === "trash") {
                        if (softDeleteField) {
                            // eslint-disable-next-line security/detect-object-injection
                            show = show && record[softDeleteField] === true
                        }
                    }
                }
                if (filter.type === "range") {
                    if (filter.selector === "week" || filter.selector === "month") {
                        const range = JSON.parse(filter.value) as { from: string; to: string }
                        show =
                            show &&
                            record[filter.field] >= new Date(range.from) &&
                            record[filter.field] <= new Date(range.to)
                    } else {
                        const range = JSON.parse(filter.value) as { from: string; to: string }
                        show =
                            show &&
                            record[filter.field] >= new Date(range.from) &&
                            record[filter.field] < new Date(range.to)
                    }
                }
                if (filter.type === "select") {
                    const field = getField(fields, filter.field)
                    if (field.type === "Boolean") {
                        const fieldCustomization = getFieldCustomization(field, customization)
                        const label = tryFunction(fieldCustomization.admin?.label) || field.name
                        const title = tryFunction(filter.title) || label || field.name
                        show = show && filter.value === title
                    } else if (field.type === "Array") {
                        show = show && record[filter.field]?.includes(filter.value)
                    } else if (field.type === "Number") {
                        show = show && record[filter.field] === Number(filter.value)
                    } else {
                        show = show && record[filter.field] === filter.value
                    }
                }
                if (filter.type === "relation") {
                    const field = getField(fields, filter.field)
                    show = show && record[`${field.name}_Array`]?.includes(filter.value)
                }
            })
            return show
        },
        [filters, statusField, softDeleteField],
    )

    return (
        <FiltersContext.Provider value={{ filters, setFilters, order, setOrder, getFilterConstraints, filterRecord }}>
            {children}
        </FiltersContext.Provider>
    )
}

export const useFilters = () => {
    const context = useContext(FiltersContext)
    if (!context) {
        throw new Error("useFilters must be used within a FiltersProvider")
    }
    return context
}

import { Filter, RelationList } from "@stoker-platform/types"
import { getState } from "./getState"
import { saveState } from "./saveState"

const FILTERS_KEY = "relation-list-filters"
const ASSIGNING_KEY = "relation-list-assigning"

export const serializeFilters = (relationList: RelationList, filters: Filter[]) =>
    filters
        .filter(
            (filter) =>
                filter.type !== "status" &&
                filter.type !== "range" &&
                !!filter.value &&
                relationList.showFilters?.includes(filter.field),
        )
        .map((filter) => {
            if (filter.type === "status" || filter.type === "range" || !filter.value) return ""
            return `${filter.field}=${filter.value.toString()}`
        })
        .filter(Boolean)
        .join(",")

export const saveFilters = (pathname: string, relationList: RelationList, filters: Filter[]) => {
    const filterParam = serializeFilters(relationList, filters)
    if (!filterParam) return
    saveState(FILTERS_KEY, `${pathname}|${filterParam}`)
}

export const loadFilters = (pathname: string): string[] | undefined => {
    // eslint-disable-next-line security/detect-object-injection
    const state = getState()[FILTERS_KEY] as string | undefined
    if (!state) return undefined
    const separatorIndex = state.indexOf("|")
    if (separatorIndex < 0) return undefined
    if (state.slice(0, separatorIndex) !== pathname) return undefined
    const savedFilters = state.slice(separatorIndex + 1)
    return savedFilters ? savedFilters.split(",") : []
}

export const saveAssigning = (pathname: string, isAssigning: boolean) => {
    saveState(ASSIGNING_KEY, `${pathname}|${isAssigning ? "true" : "false"}`)
}

export const loadAssigning = (pathname: string): boolean | undefined => {
    // eslint-disable-next-line security/detect-object-injection
    const state = getState()[ASSIGNING_KEY] as string | undefined
    if (!state) return undefined
    const separatorIndex = state.indexOf("|")
    if (separatorIndex < 0) return undefined
    if (state.slice(0, separatorIndex) !== pathname) return undefined
    return state.slice(separatorIndex + 1) === "true"
}

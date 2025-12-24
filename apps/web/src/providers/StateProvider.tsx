import { getState } from "@/utils/getState"
import { deleteState, saveState } from "@/utils/saveState"
import { StokerState } from "@stoker-platform/types"
import { getSchema } from "@stoker-platform/web-client"
import { SortingState } from "@tanstack/react-table"
import { createContext, useContext, useState } from "react"
import { useLocation } from "react-router"

export const StateContext = createContext<
    | [state: StokerState, setState: (key: string, param: string, value: string | number | SortingState) => void]
    | undefined
>(undefined)

interface StateProviderProps {
    children: React.ReactNode
}

// eslint-disable-next-line react/prop-types
export const StateProvider: React.FC<StateProviderProps> = ({ children }) => {
    const location = useLocation()
    const schema = getSchema()
    const urlState = new URLSearchParams(window.location.search)

    const [initialized, setIsInitialized] = useState(false)

    if (!initialized) {
        const collectionNamesLower = Object.keys(schema.collections).map((collection) => collection.toLowerCase())
        if (collectionNamesLower.includes(location.pathname.split("/")[1].split("?")[0])) {
            const collection = location.pathname.split("/")[1].split("?")[0]
            if (urlState.has("tab")) {
                saveState(`collection-tab-${collection}`, urlState.get("tab") as string)
            }
            if (urlState.has("search")) {
                saveState(`collection-search-${collection}`, urlState.get("search") as string)
            }
            if (urlState.has("status-filter")) {
                saveState(`collection-status-filter-${collection}`, urlState.get("status-filter") as string)
            }

            if (urlState.has("sort")) {
                saveState(`collection-sort-${collection}`, urlState.get("sort") as string)
            }
            if (urlState.has("page")) {
                saveState(`collection-page-number-${collection}`, urlState.get("page") as string)
            }

            if (urlState.has("calendar-large")) {
                saveState(`collection-calendar-large-${collection}`, urlState.get("calendar-large") as string)
            }
            if (urlState.has("calendar-small")) {
                saveState(`collection-calendar-small-${collection}`, urlState.get("calendar-small") as string)
            }
            if (urlState.has("calendar-large-date")) {
                saveState(`collection-calendar-large-date-${collection}`, urlState.get("calendar-large-date") as string)
            }
            if (urlState.has("calendar-small-date")) {
                saveState(`collection-calendar-small-date-${collection}`, urlState.get("calendar-small-date") as string)
            }

            if (urlState.has("filters")) {
                saveState(`collection-filters-${collection}`, urlState.get("filters") as string)
            }
            if (urlState.has("range")) {
                saveState(`collection-range-${collection}`, urlState.get("range") as string)
            }
            if (urlState.has("field")) {
                saveState(`collection-range-field-${collection}`, urlState.get("field") as string)
            }
            if (urlState.has("selector")) {
                saveState(`collection-range-selector-${collection}`, urlState.get("selector") as string)
            }
        }
        setIsInitialized(true)
    }

    const stokerState = getState()
    const [state, setStokerState] = useState<StokerState>(stokerState)
    const setState = (key: string, param: string, value: string | number | SortingState) => {
        if (typeof value === "number") {
            value = value.toString()
        }
        if (typeof value === "object") {
            value = JSON.stringify(value)
        }
        if (value === "DELETE_STATE") {
            setStokerState((prevState) => {
                const newState = { ...prevState }
                delete newState[key as keyof StokerState]
                return newState
            })
            deleteState(key)

            const url = new URL(window.location.href)
            url.searchParams.delete(param)
            window.history.replaceState({}, "", url.toString())
        } else {
            setStokerState((prevState) => {
                const newState = { ...prevState, [key]: value }
                return newState
            })
            saveState(key, value)

            if (!(param === "start" || param === "end")) {
                const url = new URL(window.location.href)
                url.searchParams.set(param, value)
                window.history.replaceState({}, "", url.toString())
            }
        }
    }
    return <StateContext.Provider value={[state, setState]}>{children}</StateContext.Provider>
}

export const useStokerState = () => {
    const context = useContext(StateContext)
    if (!context) {
        throw new Error("useStokerState must be used within a StateProvider")
    }
    return context
}

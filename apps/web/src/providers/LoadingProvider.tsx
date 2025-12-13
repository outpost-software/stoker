import { createContext, useContext, useMemo, useState } from "react"
import debounce from "lodash/debounce.js"
import { serverReadOnly } from "@/utils/serverReadOnly"
import { useLocation } from "react-router"
import { getSchema } from "@stoker-platform/web-client"

export const GlobalLoadingContext = createContext<
    | {
          isGlobalLoading: Map<string, { server: boolean | undefined }>
          isGlobalCachePending: Map<string, { server: boolean | undefined }>
          setGlobalLoading: (operation: "+" | "-", id: string, server?: boolean, cache?: boolean) => void
      }
    | undefined
>(undefined)

interface GlobalLoadingProviderProps {
    children: React.ReactNode
}

// eslint-disable-next-line react/prop-types
export const GlobalLoadingProvider: React.FC<GlobalLoadingProviderProps> = ({ children }) => {
    const [isGlobalLoading, setLoading] = useState<Map<string, { server: boolean | undefined }>>(
        new Map<string, { server: boolean | undefined }>(),
    )
    const [isGlobalCachePending, setGlobalCachePending] = useState<Map<string, { server: boolean | undefined }>>(
        new Map<string, { server: boolean | undefined }>(),
    )
    const setGlobalLoading = (operation: "+" | "-", id: string, server?: boolean, cache?: boolean) => {
        if (cache) {
            if (operation === "+") {
                setGlobalCachePending((prev) => {
                    const newMap = new Map(prev)
                    newMap.set(id, { server })
                    return newMap
                })
            } else {
                setGlobalCachePending((prev) => {
                    const newMap = new Map(prev)
                    newMap.delete(id)
                    return newMap
                })
            }
        } else {
            if (operation === "+") {
                setLoading((prev) => {
                    const newMap = new Map(prev)
                    newMap.set(id, { server })
                    return newMap
                })
            } else {
                setLoading((prev) => {
                    const newMap = new Map(prev)
                    newMap.delete(id)
                    return newMap
                })
            }
        }
    }
    return (
        <GlobalLoadingContext.Provider value={{ isGlobalLoading, isGlobalCachePending, setGlobalLoading }}>
            {children}
        </GlobalLoadingContext.Provider>
    )
}

export const useGlobalLoading = () => {
    const context = useContext(GlobalLoadingContext)
    if (!context) {
        throw new Error("useLoading must be used within a LoadingProvider")
    }
    return context
}

export const RouteLoadingContext = createContext<
    | {
          isRouteLoading: Set<string>
          isRouteLoadingImmediate: Set<string>
          setIsRouteLoading: (operation: "+" | "-", route: string, immediate?: boolean) => void
      }
    | undefined
>(undefined)

interface RouteLoadingProviderProps {
    children: React.ReactNode
}

// eslint-disable-next-line react/prop-types
export const RouteLoadingProvider: React.FC<RouteLoadingProviderProps> = ({ children }) => {
    const schema = getSchema()
    const location = useLocation()
    const [isRouteLoading, setLoading] = useState<Set<string>>(new Set<string>())
    const [isRouteLoadingImmediate, setLoadingImmediate] = useState<Set<string>>(new Set<string>())

    const setIsRouteLoadingDebounced = useMemo(() => {
        const debouncedSet = debounce((operation: "+" | "-", route: string) => {
            if (operation === "+") {
                setLoading((prev) => {
                    const newSet = new Set(prev)
                    newSet.add(route)
                    return newSet
                })
            } else {
                setLoading((prev) => {
                    const newSet = new Set(prev)
                    newSet.delete(route)
                    return newSet
                })
            }
        }, 500)

        return (operation: "+" | "-", route: string) => {
            debouncedSet(operation, route)
        }
    }, [])

    const setIsRouteLoadingImmediate = (operation: "+" | "-", route: string) => {
        if (operation === "+") {
            setLoading((prev) => {
                const newSet = new Set(prev)
                newSet.add(route)
                return newSet
            })
        } else {
            setLoading((prev) => {
                const newSet = new Set(prev)
                newSet.delete(route)
                return newSet
            })
        }
    }

    const setIsRouteLoading = (operation: "+" | "-", route: string, immediate?: boolean) => {
        if (operation === "+") {
            setLoadingImmediate((prev) => {
                const newSet = new Set(prev)
                newSet.add(route)
                return newSet
            })
        } else {
            setLoadingImmediate((prev) => {
                const newSet = new Set(prev)
                newSet.delete(route)
                return newSet
            })
        }

        const collectionName = location.pathname
            .split("/")[1]
            .split("?")[0]
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join("_")
        // eslint-disable-next-line security/detect-object-injection
        const collection = schema.collections[collectionName]
        if ((collection && serverReadOnly(collection)) || immediate) {
            setIsRouteLoadingImmediate(operation, route)
        } else {
            setIsRouteLoadingDebounced(operation, route)
        }
    }
    return (
        <RouteLoadingContext.Provider value={{ isRouteLoading, isRouteLoadingImmediate, setIsRouteLoading }}>
            {children}
        </RouteLoadingContext.Provider>
    )
}

export const useRouteLoading = () => {
    const context = useContext(RouteLoadingContext)
    if (!context) {
        throw new Error("useLoading must be used within a LoadingProvider")
    }
    return context
}

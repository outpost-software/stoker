import { getGlobalConfigModule } from "../../initializeStoker"
import { Unsubscribe } from "firebase/firestore"
import { preloadCollection } from "./preloadCollection"
import { getCachedConfigValue } from "@stoker-platform/utils"
import { PreloadCacheInitial } from "@stoker-platform/types"

const state: {
    [collection: string]: "Loading" | "Loaded" | "Error"
} = {}

const listeners: {
    [collection: string]: Unsubscribe[]
} = {}

export const preloadCache = async (initial?: PreloadCacheInitial) => {
    /* eslint-disable security/detect-object-injection */
    for (const collection of Object.keys(listeners)) {
        delete listeners[collection]
    }
    for (const collection of Object.keys(initial || {})) {
        listeners[collection] = []
        delete state[collection]
    }

    const globalConfig = await getGlobalConfigModule()
    const preloadConfigSync = await getCachedConfigValue(globalConfig, ["global", "preload", "sync"])
    const preloadConfig = await getCachedConfigValue(globalConfig, ["global", "preload", "async"])

    if (preloadConfig) {
        for (const collection of preloadConfig) {
            if (!initial?.[collection]) continue
            preloadCollection(
                collection,
                initial?.[collection].constraints,
                initial?.[collection].range,
                initial?.[collection].orQueries,
            )
        }
    }
    if (preloadConfigSync) {
        for (const collection of preloadConfigSync) {
            if (!initial?.[collection]) continue
            await preloadCollection(
                collection,
                initial?.[collection].constraints,
                initial?.[collection].range,
                initial?.[collection].orQueries,
            )
        }
    }

    for (const collection of Object.keys(initial || {})) {
        if (preloadConfig.includes(collection) || preloadConfigSync.includes(collection)) continue
        await preloadCollection(
            collection,
            initial?.[collection].constraints,
            initial?.[collection].range,
            initial?.[collection].orQueries,
        )
    }
    /* eslint-enable security/detect-object-injection */

    return listeners
}

export const getLoadingState = () => {
    // eslint-disable-next-line security/detect-object-injection
    return state
}

export const getPreloadListeners = () => {
    // eslint-disable-next-line security/detect-object-injection
    return listeners
}

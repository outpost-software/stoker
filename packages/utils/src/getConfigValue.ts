import {
    ConfigCache,
    GlobalConfig,
    CollectionCustomization,
    StokerCollection,
    AuthConfig,
    FirebaseConfig,
    PreloadConfig,
    MailConfig,
    CollectionSchema,
    AdminConfig,
} from "@stoker-platform/types"
import merge from "lodash/merge.js"
import set from "lodash/set.js"

const configCache: ConfigCache = {
    global: {},
    collections: {},
}

export const clearConfigCache = () => {
    configCache.global = {}
    configCache.collections = {}
}

export const tryFunction = (configProperty: unknown, args?: unknown[]) => {
    if (configProperty && typeof configProperty === "function") {
        return args ? configProperty(...args) : configProperty()
    }
    return configProperty
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tryPromise = async (configProperty: any, args?: unknown[]) => {
    let configValue = configProperty
    if (configProperty && (typeof configProperty === "function" || typeof configProperty.then === "function")) {
        args ? (configValue = await configProperty(...args)) : (configValue = await configProperty())
    }
    return configValue
}

type ConfigPath =
    | [
          "global",
          keyof GlobalConfig,
          (keyof AuthConfig | keyof FirebaseConfig | keyof PreloadConfig | keyof MailConfig | keyof AdminConfig)?,
          ...string[],
      ]
    | ["collections", StokerCollection, keyof CollectionSchema, ...string[]]

export const getCachedConfigValue = async (
    config: GlobalConfig | CollectionCustomization,
    pathArray: ConfigPath,
    args?: unknown[],
    overwrite?: boolean,
) => {
    /* eslint-disable security/detect-object-injection, @typescript-eslint/no-explicit-any */
    // Validate path array to prevent prototype pollution
    for (const property of pathArray) {
        if (property === "__proto__" || property === "constructor" || property === "prototype") {
            throw new Error("Invalid config path: prototype pollution keys are not allowed")
        }
    }
    let configCacheProperty: any = configCache
    let existsInCache = true
    for (const property of pathArray) {
        if (property === undefined || configCacheProperty[property] === undefined) {
            existsInCache = false
            break
        }
        configCacheProperty = configCacheProperty[property]
    }
    if (configCacheProperty && existsInCache && !overwrite) {
        return configCacheProperty
    }

    let modifiedPathArray
    let configProperty: any = config
    let existsInConfig = true
    pathArray[0] === "collections" ? (modifiedPathArray = pathArray.slice(2)) : (modifiedPathArray = pathArray.slice(1))
    for (const property of modifiedPathArray) {
        if (property === undefined || configProperty[property] === undefined) {
            existsInConfig = false
            break
        }
        configProperty = configProperty[property]
    }
    let configValue
    if (existsInConfig) configValue = await tryPromise(configProperty, args)

    if (configValue) {
        let currentCache: any = configCache
        const cachePartial: any = {}
        for (let i = 0; i < pathArray.length; i++) {
            const property = pathArray[i]
            if (property === undefined) {
                continue
            }
            // Additional check to prevent prototype pollution
            if (property === "__proto__" || property === "constructor" || property === "prototype") {
                throw new Error("Invalid config path: prototype pollution keys are not allowed")
            }
            if (i === pathArray.length - 1) {
                set(cachePartial, pathArray.join("."), configValue)
            } else {
                currentCache[property] ||= {}
                currentCache = currentCache[property]
            }
        }
        merge(configCache, cachePartial)
    }
    /* eslint-enable security/detect-object-injection, @typescript-eslint/no-explicit-any */

    return configValue
}

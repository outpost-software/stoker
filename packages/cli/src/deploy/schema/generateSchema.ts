import { tryPromise } from "@stoker-platform/node-client"
import {
    CalendarConfig,
    CardsConfig,
    CollectionAdmin,
    CollectionSchema,
    CollectionsSchema,
    Filter,
    GlobalConfig,
    Query,
} from "@stoker-platform/types"
import { getRelationLists, roleHasOperationAccess } from "@stoker-platform/utils"
import { ServerValue } from "firebase-admin/database"
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import { pathToFileURL } from "url"

export const generateSchema = async (includeComputedFields: boolean = false) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newSchema = {} as CollectionsSchema

    const path = join(process.cwd(), "lib", "main.js")
    const url = pathToFileURL(path).href
    const globalConfigFile = await import(url)
    const globalConfig: GlobalConfig = globalConfigFile.default("node")

    const projectData = await readFile(join(process.cwd(), "project-data.json"), "utf8")
    const projectDataJson = JSON.parse(projectData)
    const version = projectDataJson.version || 1

    newSchema.version = version
    newSchema.published_time = ServerValue.TIMESTAMP

    const collections = await readdir(join(process.cwd(), "lib", "collections"))
    const { roles, firebase } = globalConfig as GlobalConfig
    const configSchema: {
        roles: typeof roles
        permissionsIndexExemption: boolean
        writeLogIndexExemption?: string[]
        writeLogTTL?: number
    } = {
        roles,
        permissionsIndexExemption: false,
    }
    if (firebase?.permissionsIndexExemption) configSchema.permissionsIndexExemption = true
    firebase?.writeLogIndexExemption
        ? (configSchema.writeLogIndexExemption = firebase?.writeLogIndexExemption || [])
        : null
    firebase?.writeLogTTL ? (configSchema.writeLogTTL = firebase?.writeLogTTL) : null
    newSchema.config = configSchema

    const fullSchema: CollectionSchema[] = []
    for (const collection of collections) {
        if (globalConfig.disabledCollections?.includes(collection)) continue
        const path = join(process.cwd(), "lib", "collections", collection)
        const url = pathToFileURL(path).href
        const schema = await import(url)
        fullSchema.push(schema.default("node"))
    }

    newSchema.collections = {}
    for (const collection of collections) {
        if (globalConfig.disabledCollections?.includes(collection)) continue
        const path = join(process.cwd(), "lib", "collections", collection)
        const url = pathToFileURL(path).href
        const schema = await import(url)
        const persistSchema: CollectionSchema = schema.default("node")
        const { labels, access, preloadCache, admin } = persistSchema
        const { serverReadOnly } = access

        if (!includeComputedFields) {
            persistSchema.fields = persistSchema.fields.filter((field) => field.type !== "Computed")
        } else {
            for (const field of persistSchema.fields) {
                if (field.type === "Computed") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    delete (field as any).formula
                }
            }
        }

        if (admin) {
            const filters = ((await tryPromise(admin.filters)) || []) as Filter[]
            const cards = (await tryPromise(admin.cards)) as CardsConfig | undefined
            const calendar = (await tryPromise(admin.calendar)) as CalendarConfig | undefined
            const statusField = (await tryPromise(admin.statusField)) as CollectionAdmin["statusField"]
            const readRoles = roles.filter((role) => roleHasOperationAccess(persistSchema, role, "read"))
            const nonStandardRoles = (serverReadOnly || []).concat(preloadCache?.roles || [])
            const standardRoles = readRoles.filter((role) => !nonStandardRoles.includes(role))
            const noPreloadCacheRoles = readRoles.filter((role) => !preloadCache?.roles.includes(role))
            const addUnscheduledRoles = calendar?.unscheduled?.roles && !noPreloadCacheRoles.length
            if (calendar?.unscheduled) {
                filters.push({
                    type: "select",
                    field: calendar.startField,
                    roles: calendar?.unscheduled.roles,
                })
            }
            const relationListFields = getRelationLists(labels.collection, fullSchema)
            if (relationListFields.size > 0) {
                for (const relationListField of relationListFields.values()) {
                    const existingRelationFilter = filters.find(
                        (filter: Filter) => filter.type === "relation" && filter.field === relationListField.field,
                    )
                    if (existingRelationFilter && existingRelationFilter.type === "relation") {
                        if (existingRelationFilter.roles) {
                            const newRoles = new Set(existingRelationFilter.roles)
                            for (const role of relationListField.roles || noPreloadCacheRoles) {
                                if (noPreloadCacheRoles.includes(role)) {
                                    newRoles.add(role)
                                }
                            }
                            existingRelationFilter.roles = Array.from(newRoles)
                        }
                    } else {
                        filters.push({
                            type: "relation",
                            field: relationListField.field,
                            roles:
                                relationListField.roles?.filter((role) => noPreloadCacheRoles.includes(role)) ||
                                noPreloadCacheRoles,
                        })
                    }
                }
            }
            if (statusField || cards?.statusField) {
                const existingStatusFieldIndex = filters.findIndex(
                    (filter: Filter) =>
                        "field" in filter && filter.field === (statusField?.field || cards?.statusField),
                )
                const newFilter: Filter = {
                    type: "status",
                }
                if (addUnscheduledRoles) {
                    newFilter.roles = calendar?.unscheduled?.roles
                }
                filters.push(newFilter)
                if (existingStatusFieldIndex !== -1) {
                    filters.splice(existingStatusFieldIndex, 1)
                }
            }
            if (calendar) {
                const existingRangeIndex = filters.findIndex((filter: Filter) => filter.type === "range")
                if (existingRangeIndex === -1) {
                    if (noPreloadCacheRoles.length) {
                        filters.push({
                            type: "range",
                            field: calendar.startField,
                        })
                    }
                } else {
                    if (noPreloadCacheRoles.length === 0) {
                        filters.splice(existingRangeIndex, 1)
                    }
                }
            }
            if ((cards || admin.images) && standardRoles.length) {
                filters.push({
                    type: "select",
                    field: "Last_Save_At",
                    roles: standardRoles,
                })
            }
            const persistFilters: Query[] = []
            filters.forEach((filter: Filter) => {
                const persistFilter = {} as Query
                if (filter.type === "status") {
                    if (statusField || cards?.statusField) {
                        const field = statusField?.field || cards?.statusField
                        if (field) {
                            persistFilter.field = field
                        }
                    }
                } else {
                    persistFilter.field = filter.field
                }
                if ("roles" in filter && filter.roles?.length) {
                    persistFilter.roles = filter.roles
                }
                if (addUnscheduledRoles) {
                    if (persistFilter.roles?.length) {
                        persistFilter.roles = persistFilter.roles?.filter((role) =>
                            calendar.unscheduled?.roles?.includes(role),
                        )
                    } else {
                        persistFilter.roles = calendar.unscheduled?.roles
                    }
                }
                if (filter.type === "range") {
                    persistFilter.range = true
                }
                if (filter.type !== "status" && filter.field === "Last_Save_At" && filter.type === "select") {
                    persistFilter.standalone = true
                }
                persistFilters.push(persistFilter)
            })
            persistSchema.queries = persistFilters
        }

        delete persistSchema.custom
        delete persistSchema.admin
        for (const field of persistSchema.fields) {
            delete field.custom
            delete field.admin
        }
        newSchema.collections[collection.split(".")[0]] = persistSchema
    }

    return newSchema
}

import { readFileSync } from "node:fs"
import type { CollectionSchema, CollectionsSchema, StokerRole } from "@stoker-platform/types"
import { roleHasOperationAccess } from "@stoker-platform/utils"
import type { StokerProject } from "./project.js"

export type StokerOperation = "read" | "create" | "update" | "delete"

export const loadSchema = (project: StokerProject): CollectionsSchema => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const projectData = JSON.parse(readFileSync(project.projectDataPath, "utf8"))
    return projectData.schema
}

export const getRoles = (schema: CollectionsSchema): StokerRole[] => schema.config.roles

export const getRootCollections = (schema: CollectionsSchema): CollectionSchema[] =>
    Object.values(schema.collections).filter((collection) => !collection.parentCollection)

export const roleCanAccess = (collection: CollectionSchema, role: StokerRole, operation: StokerOperation): boolean =>
    !!roleHasOperationAccess(collection, role, operation)

export const readableCollections = (schema: CollectionsSchema, role: StokerRole): CollectionSchema[] =>
    getRootCollections(schema).filter((collection) => roleCanAccess(collection, role, "read"))

export const listableCollections = (schema: CollectionsSchema, role: StokerRole): CollectionSchema[] =>
    readableCollections(schema, role).filter((collection) => !collection.singleton)

export const collectionPath = (collection: CollectionSchema): string => `/${collection.labels.collection.toLowerCase()}`

export const recordPath = (collection: CollectionSchema, id: string): string =>
    `/${collection.labels.record.toLowerCase()}/${collection.labels.collection}/${id}`

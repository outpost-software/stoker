import { readFileSync } from "node:fs"
import type { CollectionSchema, CollectionsSchema, NodeUtilities, StokerRole } from "@stoker-platform/types"
import { roleHasOperationAccess } from "@stoker-platform/utils"
import type { StokerProject } from "./project.js"
import { initializeStoker } from "@stoker-platform/node-client"
import { join } from "node:path"
import { emulatorFirestore } from "./emulator.js"

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

export const assignsFilePermissions = (collection: CollectionSchema, role: StokerRole): boolean => {
    // eslint-disable-next-line security/detect-object-injection
    const assignment = collection.access?.files?.assignment?.[role]
    if (!assignment) return true
    const optional = assignment.optional ?? {}
    return [optional.read, optional.update, optional.delete].some((roles) => roles && roles.length > 0)
}

export const collectionPath = (collection: CollectionSchema): string => `/${collection.labels.collection.toLowerCase()}`

export const recordPath = (collection: CollectionSchema, id: string): string =>
    `/${collection.labels.record.toLowerCase()}/${collection.labels.collection}/${id}`

let stoker: Promise<NodeUtilities> | undefined

export const customizationFile = async (project: StokerProject, schema: CollectionsSchema, collection: string) => {
    const tenant = await emulatorFirestore(project)
    stoker ??= initializeStoker(
        "development",
        tenant.id,
        join(project.rootDir, "lib", "main.js"),
        join(project.rootDir, "lib", "collections"),
    )
    const { getCustomizationFile } = await stoker
    return getCustomizationFile(collection, schema)
}

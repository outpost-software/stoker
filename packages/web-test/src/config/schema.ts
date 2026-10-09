import { readFileSync } from "node:fs"
import type {
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    StokerRecord,
    StokerRole,
} from "@stoker-platform/types"
import { canUpdateField, roleHasOperationAccess, tryPromise } from "@stoker-platform/utils"
import type { StokerProject } from "./project.js"
import { getCustomizationFile } from "@stoker-platform/node-client"
import { getCurrentUser, getCurrentUserPermissions } from "../initializeStoker.js"

export type StokerOperation = "read" | "create" | "update" | "delete"

export const loadSchema = (project: StokerProject): CollectionsSchema => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const projectData = JSON.parse(readFileSync(project.projectDataPath, "utf8"))
    return projectData.schema
}

export const getRootCollections = (schema: CollectionsSchema): CollectionSchema[] =>
    Object.values(schema.collections).filter((collection) => !collection.parentCollection)

export const readableCollections = (schema: CollectionsSchema, role: StokerRole): CollectionSchema[] =>
    getRootCollections(schema).filter((collection) => roleHasOperationAccess(collection, role, "read"))

export const listableCollections = (schema: CollectionsSchema, role: StokerRole): CollectionSchema[] =>
    readableCollections(schema, role).filter((collection) => !collection.singleton)

export const isUnique = (field: CollectionField): boolean => "unique" in field && field.unique === true

export const distinctValue = (field: CollectionField, value: string, label: string, step: number): string => {
    if (field.type === "String" && field.email) return `${label.toLowerCase()}-${value}`
    if (field.type === "Number") return `${Number(value) + step}`
    return `${value} ${label}`
}

export const relationListTitle = async (
    schema: CollectionsSchema,
    related: CollectionSchema,
    parent: CollectionSchema,
    record: StokerRecord,
    fallback: string,
) => {
    const customization = await getCustomizationFile(related.labels.collection, schema)
    const configured = await tryPromise(customization.admin?.titles, ["relation-list", parent, record])
    return configured?.collection || fallback
}

export const updatableFieldNames = async (collection: CollectionSchema, role: string): Promise<Set<string>> => {
    const user = await getCurrentUser(role)
    const permissions = await getCurrentUserPermissions(role)
    const claims = user.customClaims ?? {}
    return new Set(
        collection.fields
            .filter((field) => canUpdateField(collection, field, permissions, claims))
            .map((field) => field.name),
    )
}

export const createHidden = async (
    schema: CollectionsSchema,
    collection: CollectionSchema,
    parent: CollectionSchema,
): Promise<boolean> => {
    const customization = await getCustomizationFile(collection.labels.collection, schema)
    return !!(await tryPromise(customization.admin?.hideCreate, [parent.labels.collection]))
}

export const updatesDisabled = async (
    schema: CollectionsSchema,
    collection: CollectionSchema,
    record: StokerRecord,
): Promise<boolean> => {
    const customization = await getCustomizationFile(collection.labels.collection, schema)
    return !!(await tryPromise(customization.admin?.disableUpdate, ["update", record]))
}

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

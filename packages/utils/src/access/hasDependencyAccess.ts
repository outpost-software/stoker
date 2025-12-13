import { CollectionSchema, CollectionsSchema, DependencyField, StokerPermissions } from "@stoker-platform/types"
import { privateFieldAccess } from "./collection.js"
import { isRelationField } from "../schema/isRelationField.js"

export const hasDependencyAccess = (
    collection: CollectionSchema,
    schema: CollectionsSchema,
    permissions: StokerPermissions,
) => {
    const collections: CollectionSchema[] = Object.values(schema.collections)
    const { labels } = collection
    const hasDependencyAccess: DependencyField[] = []
    for (const collectionSchema of collections) {
        const { fields: dependencyFields } = collectionSchema
        for (const field of dependencyFields) {
            if (field.access && !privateFieldAccess(field, permissions)) continue
            if (!permissions.Role) continue
            if (isRelationField(field) && field.collection === labels.collection && field.dependencyFields) {
                for (const dependencyField of field.dependencyFields) {
                    const existingField = hasDependencyAccess.find((field) => field.field === dependencyField.field)
                    if (!existingField && dependencyField.roles.includes(permissions.Role))
                        hasDependencyAccess.push(dependencyField)
                }
            }
        }
    }
    return hasDependencyAccess
}

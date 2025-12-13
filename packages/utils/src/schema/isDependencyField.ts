import { CollectionField, CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import { isRelationField } from "./isRelationField.js"

export const isDependencyField = (
    mainField: CollectionField,
    collection: CollectionSchema,
    schema: CollectionsSchema,
) => {
    const collections: CollectionSchema[] = Object.values(schema.collections)
    const { labels } = collection
    let isDependencyField = false
    for (const collectionSchema of collections) {
        const { fields: dependencyFields } = collectionSchema
        for (const field of dependencyFields) {
            if (isRelationField(field) && field.collection === labels.collection && field.dependencyFields) {
                for (const dependencyField of field.dependencyFields) {
                    if (dependencyField.field == mainField.name) isDependencyField = true
                }
            }
        }
    }
    return isDependencyField
}

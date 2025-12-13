import { CollectionField, CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import { isRelationField } from "./isRelationField.js"

export const isIncludedField = (
    mainField: CollectionField,
    collection: CollectionSchema,
    schema: CollectionsSchema,
) => {
    const collections: CollectionSchema[] = Object.values(schema.collections)
    const { labels } = collection
    let isIncludedField = false
    for (const collectionSchema of collections) {
        const { fields: includeFields } = collectionSchema
        for (const field of includeFields) {
            if (isRelationField(field) && field.collection === labels.collection && field.includeFields) {
                for (const includeField of field.includeFields) {
                    if (includeField == mainField.name) isIncludedField = true
                }
            }
        }
    }
    return isIncludedField
}

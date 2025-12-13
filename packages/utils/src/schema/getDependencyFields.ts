import { CollectionSchema, CollectionField, DependencyField, CollectionsSchema } from "@stoker-platform/types"
import { isRelationField } from "./isRelationField.js"

export const getDependencyFields = (collection: CollectionSchema, schema: CollectionsSchema) => {
    const collections: CollectionSchema[] = Object.values(schema.collections)
    const { labels } = collection
    const dependentFields: { [field: string]: { [collection: string]: string[] } } = {}
    collections.forEach((collectionSchema: CollectionSchema) => {
        const { labels: dependencyName, fields: dependencyFields } = collectionSchema
        dependencyFields.forEach((field: CollectionField) => {
            if (isRelationField(field) && field.collection === labels.collection && field.dependencyFields) {
                field.dependencyFields.forEach((dependencyField: DependencyField) => {
                    dependentFields[dependencyField.field] ||= {}
                    dependentFields[dependencyField.field][dependencyName.collection] ||= []
                    dependentFields[dependencyField.field][dependencyName.collection] = dependentFields[
                        dependencyField.field
                    ][dependencyName.collection].concat(dependencyField.roles)
                    dependentFields[dependencyField.field][dependencyName.collection] = [
                        ...new Set(dependentFields[dependencyField.field][dependencyName.collection]),
                    ]
                })
            }
        })
    })
    return dependentFields
}

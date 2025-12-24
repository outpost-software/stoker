import { CollectionField, CollectionSchema } from "@stoker-platform/types"
import { getLowercaseFields } from "./getLowercaseFields.js"
import { getSingleFieldRelations } from "./getSingleFieldRelations.js"
import { isRelationField } from "../schema/isRelationField.js"

export const getExtendedSchema = (collection: CollectionSchema, fields: CollectionField[]) => {
    const extendedSchema: string[] = []
    fields.forEach((field) => {
        extendedSchema.push(field.name)
    })
    const lowercaseFields = getLowercaseFields(collection, fields)
    lowercaseFields.forEach((field) => {
        extendedSchema.push(`${field.name}_Lowercase`)
    })
    const singleRelationFields = getSingleFieldRelations(collection, fields)
    singleRelationFields.forEach((field) => {
        extendedSchema.push(`${field.name}_Single`)
    })
    fields.forEach((field) => {
        if (isRelationField(field)) {
            extendedSchema.push(`${field.name}_Array`)
        }
    })
    return extendedSchema
}

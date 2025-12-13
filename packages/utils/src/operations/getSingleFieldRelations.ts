import { CollectionField, CollectionSchema } from "@stoker-platform/types"
import { getField } from "../schema/getField.js"
import { isRelationField } from "../schema/isRelationField.js"

export const getSingleFieldRelations = (collection: CollectionSchema, fields: CollectionField[]) => {
    const { access, queries } = collection
    const { serverReadOnly } = access
    const singleRelationFields: Set<CollectionField> = new Set()
    if (queries) {
        for (const query of queries) {
            const queryField = getField(fields, query.field)
            if (fields.find((field) => field.name === query.field)) {
                if (isRelationField(queryField) && ["OneToOne", "OneToMany"].includes(queryField.type)) {
                    singleRelationFields.add(queryField)
                }
            }
        }
    }
    fields.forEach((field) => {
        if (
            isRelationField(field) &&
            ["OneToOne", "OneToMany"].includes(field.type) &&
            field.sorting &&
            (typeof field.sorting === "boolean" ||
                !field.sorting.roles?.every((role) => serverReadOnly?.includes(role)))
        ) {
            singleRelationFields.add(field)
        }
    })
    return singleRelationFields
}

import { CollectionField, CollectionSchema } from "@stoker-platform/types"

export const getLowercaseFields = (collection: CollectionSchema, fields: CollectionField[]) => {
    const { access, recordTitleField } = collection
    const { serverReadOnly } = access
    const lowercaseFields: Set<CollectionField> = new Set()
    fields.forEach((field) => {
        if (
            (recordTitleField === field.name ||
                (field.sorting &&
                    (typeof field.sorting === "boolean" ||
                        !field.sorting.roles?.every((role) => serverReadOnly?.includes(role))))) &&
            field.type === "String"
        ) {
            lowercaseFields.add(field)
        }
    })
    return lowercaseFields
}

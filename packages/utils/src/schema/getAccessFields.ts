import type { CollectionField, CollectionSchema, StokerRole } from "@stoker-platform/types"
import { getField } from "./getField.js"
import { getSystemFieldsSchema } from "./getSystemFieldsSchema.js"

export const getAccessFields = (collection: CollectionSchema, role: StokerRole) => {
    const indexFields: CollectionField[] = []
    const { access, fields } = collection
    const { attributeRestrictions, entityRestrictions } = access
    const systemFieldsSchema = getSystemFieldsSchema()
    if (attributeRestrictions) {
        attributeRestrictions.forEach((attributeRestriction) => {
            if (!attributeRestriction.roles.some((accessRole) => accessRole.role === role)) return
            switch (attributeRestriction.type) {
                case "Record_Owner":
                    indexFields.push(getField(systemFieldsSchema, "Created_By"))
                    break
                case "Record_User":
                    indexFields.push(getField(fields, attributeRestriction.collectionField))
                    break
                case "Record_Property":
                    indexFields.push(getField(fields, attributeRestriction.propertyField))
                    break
            }
        })
    }
    if (entityRestrictions) {
        entityRestrictions.restrictions?.forEach((entityRestriction) => {
            if (!entityRestriction.roles.some((accessRole) => accessRole.role === role)) return
            switch (entityRestriction.type) {
                case "Individual":
                    indexFields.push(getField(systemFieldsSchema, "id"))
                    break
                case "Parent":
                    indexFields.push(getField(fields, entityRestriction.collectionField))
                    break
                case "Parent_Property":
                    indexFields.push(getField(fields, entityRestriction.collectionField))
                    indexFields.push(getField(fields, entityRestriction.propertyField))
                    break
            }
        })
        if (entityRestrictions.parentFilters) {
            entityRestrictions.parentFilters.forEach((parentFilter) => {
                if (!parentFilter.roles.some((accessRole) => accessRole.role === role)) return
                switch (parentFilter.type) {
                    case "Individual":
                        indexFields.push(getField(fields, parentFilter.collectionField))
                        break
                    case "Parent":
                        indexFields.push(getField(fields, parentFilter.parentCollectionField))
                        break
                    case "Parent_Property":
                        indexFields.push(getField(fields, parentFilter.parentCollectionField))
                        indexFields.push(getField(fields, parentFilter.parentPropertyField))
                        break
                }
            })
        }
    }
    return [...new Set(indexFields)]
}

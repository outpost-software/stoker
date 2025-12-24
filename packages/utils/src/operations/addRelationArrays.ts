import { CollectionSchema, CollectionsSchema, StokerRecord } from "@stoker-platform/types"
import { isDeleteSentinel } from "./isDeleteSentinel.js"
import { isRelationField } from "../schema/isRelationField.js"
import { getSingleFieldRelations } from "./getSingleFieldRelations.js"
import { getField } from "../schema/getField.js"
import { getLowercaseFields } from "./getLowercaseFields.js"

export const addRelationArrays = (collection: CollectionSchema, data: StokerRecord, schema: CollectionsSchema) => {
    const { fields } = collection
    fields.forEach((field) => {
        if (isRelationField(field)) {
            if (data[field.name]) {
                if (!isDeleteSentinel(data[field.name])) {
                    data[`${field.name}_Array`] = Object.keys(data[field.name] as object)
                    if (field.includeFields) {
                        for (const includeField of field.includeFields) {
                            const relationCollection = schema.collections[field.collection]
                            const includeFieldSchema = getField(relationCollection.fields, includeField)
                            const lowercaseFields = getLowercaseFields(relationCollection, [includeFieldSchema])
                            if (lowercaseFields.size === 1) {
                                /* eslint-disable security/detect-object-injection */
                                Object.keys(data[field.name]).forEach((key) => {
                                    if (data[field.name][key][includeField]) {
                                        data[field.name][key][`${includeField}_Lowercase`] =
                                            data[field.name][key][includeField].toLowerCase()
                                    } else {
                                        delete data[field.name][key][`${includeField}_Lowercase`]
                                    }
                                })
                                /* eslint-enable security/detect-object-injection */
                            }
                        }
                    }
                } else {
                    data[`${field.name}_Array`] = data[field.name]
                }
            } else {
                delete data[`${field.name}_Array`]
                delete data[`${field.name}_Single`]
            }
        }
    })

    const singleRelationFields = getSingleFieldRelations(collection, fields)
    singleRelationFields.forEach((field) => {
        if (data[field.name]) {
            if (!isDeleteSentinel(data[field.name])) {
                const id = data[`${field.name}_Array`]?.[0]
                if (id) {
                    // eslint-disable-next-line security/detect-object-injection
                    const includeFields = data[field.name][id] || {}
                    data[`${field.name}_Single`] = { ...includeFields }
                }
            } else {
                data[`${field.name}_Single`] = data[field.name]
            }
        }
    })
}

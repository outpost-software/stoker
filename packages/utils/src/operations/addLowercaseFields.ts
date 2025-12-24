import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { getLowercaseFields } from "./getLowercaseFields.js"

export const addLowercaseFields = (collection: CollectionSchema, data: StokerRecord) => {
    const lowercaseFields = getLowercaseFields(collection, collection.fields)
    lowercaseFields.forEach((field) => {
        if (data[field.name]) {
            data[`${field.name}_Lowercase`] = data[field.name].toLowerCase()
        } else {
            delete data[`${field.name}_Lowercase`]
        }
    })
}

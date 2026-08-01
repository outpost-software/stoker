import { CollectionSchema, CollectionCustomization, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { privateFieldAccess } from "../access/collection.js"
import { tryPromise } from "../getConfigValue.js"
import { getField } from "../schema/getField.js"
import { isRelationField } from "../schema/isRelationField.js"
import { getLowercaseFields } from "./getLowercaseFields.js"

export const addInitialValues = async (
    data: StokerRecord,
    collectionSchema: CollectionSchema,
    customization: CollectionCustomization,
    permissions?: StokerPermissions,
    claims?: Record<string, unknown>,
) => {
    const { fields } = collectionSchema
    for (const field of customization.fields) {
        const fieldSchema = getField(fields, field.name)
        if (
            field.custom?.initialValue !== undefined &&
            (!fieldSchema.access || privateFieldAccess(fieldSchema, permissions, collectionSchema, claims || {}))
        ) {
            data[field.name] = await tryPromise(field.custom.initialValue, [data])
            const lowercaseFields = getLowercaseFields(collectionSchema, [fieldSchema])
            if (lowercaseFields.size === 1) {
                data[`${field.name}_Lowercase`] = data[field.name].toLowerCase()
            }
        }
    }
    for (const field of fields) {
        if (!field.access || privateFieldAccess(field, permissions, collectionSchema, claims || {})) {
            if ("autoIncrement" in field && field.autoIncrement && !data[field.name]) {
                data[field.name] = "Pending"
            }
            if (!isRelationField(field) && field.nullable && data[field.name] === undefined) {
                data[field.name] = null
            }
        }
    }
}

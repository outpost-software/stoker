import { CollectionSchema } from "@stoker-platform/types"
import { getFieldCustomization, getRoleGroup, isRelationField, tryFunction } from "@stoker-platform/utils"
import {
    getCollectionConfigModule,
    getCollectionRefs,
    getCurrentUserPermissions,
    getSchema,
} from "@stoker-platform/web-client"

export const getRelationFields = (collection: CollectionSchema) => {
    const { labels, fields } = collection
    const schema = getSchema()
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    const customization = getCollectionConfigModule(labels.collection)
    const collectionSchema = schema.collections[labels.collection]
    const relationFields: string[] = []
    for (const field of fields) {
        const fieldCustomization = getFieldCustomization(field, customization)
        if (!isRelationField(field)) continue
        const condition = tryFunction(fieldCustomization.admin?.condition?.form, ["update"])
        const roleGroup = getRoleGroup(permissions.Role, collectionSchema, schema)
        if (!roleGroup) throw new Error("PERMISSION_DENIED")
        if (!schema.collections[field.collection]) continue
        const refs = getCollectionRefs([field.collection], roleGroup)
        if (refs.length === 0) continue
        const titleField = field.titleField
        if (
            (!fieldCustomization.admin?.condition?.form || condition) &&
            !(titleField && field.includeFields?.includes(titleField))
        ) {
            relationFields.push(field.name)
        }
    }
    return relationFields
}

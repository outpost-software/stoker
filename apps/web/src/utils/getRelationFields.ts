import { CollectionSchema } from "@stoker-platform/types"
import { getFieldCustomization, isRelationField, tryFunction } from "@stoker-platform/utils"
import {
    getAllRoleGroups,
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
    const relationFields: string[] = []
    for (const field of fields) {
        const fieldCustomization = getFieldCustomization(field, customization)
        if (!isRelationField(field)) continue
        const queryFullRecord = tryFunction(fieldCustomization.admin?.queryFullRecord)
        const condition = tryFunction(fieldCustomization.admin?.condition?.form, ["update"])
        const roleGroups = getAllRoleGroups()
        const roleGroup = Array.from(roleGroups[labels.collection]).find(
            (roleGroup) => permissions.Role && roleGroup.roles.includes(permissions.Role),
        )
        if (!roleGroup) throw new Error("PERMISSION_DENIED")
        if (!schema.collections[field.collection]) continue
        const refs = getCollectionRefs([field.collection], roleGroup)
        if (refs.length === 0) continue
        const titleField = field.titleField
        if (
            (!fieldCustomization.admin?.condition?.form || condition) &&
            (!(titleField && field.includeFields?.includes(titleField)) || queryFullRecord)
        ) {
            relationFields.push(field.name)
        }
    }
    return relationFields
}

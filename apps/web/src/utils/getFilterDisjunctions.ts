import { CollectionSchema } from "@stoker-platform/types"
import { getAttributeRestrictions } from "@stoker-platform/utils"
import { getCurrentUserPermissions } from "@stoker-platform/web-client"

export const getFilterDisjunctions = (collection: CollectionSchema) => {
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    let disjunctions = 0
    const incrementDisjunctions = (value: number | undefined) => {
        if (!value) return
        if (disjunctions === 0) {
            disjunctions = value
        } else {
            disjunctions *= value
        }
    }
    const hasAttributeRestrictions = getAttributeRestrictions(collection, permissions)
    if (hasAttributeRestrictions.length > 0) {
        for (const attributeRestriction of hasAttributeRestrictions) {
            if (attributeRestriction.type === "Record_Property") {
                const propertyRole = attributeRestriction.roles.find((roleItem) => roleItem.role === permissions.Role)
                if (!propertyRole) throw new Error("PERMISSION_DENIED")
                if (attributeRestriction.operations && !attributeRestriction.operations?.includes("Read")) continue
                incrementDisjunctions(propertyRole.values?.length)
            }
        }
    }
    return disjunctions
}

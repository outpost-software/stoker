import { CollectionSchema } from "@stoker-platform/types"
import { getCurrentUserPermissions } from "@stoker-platform/web-client"

export const serverReadOnly = (collection: CollectionSchema) => {
    const { access } = collection
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    return access.serverReadOnly?.includes(permissions.Role)
}

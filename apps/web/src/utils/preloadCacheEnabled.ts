import { CollectionSchema } from "@stoker-platform/types"
import { getCurrentUserPermissions } from "@stoker-platform/web-client"

export const preloadCacheEnabled = (collection: CollectionSchema) => {
    const { preloadCache } = collection
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    return preloadCache?.roles.includes(permissions.Role)
}

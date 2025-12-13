import { CollectionField, StokerPermissions } from "@stoker-platform/types"

export function isSortingEnabled(field: CollectionField, permissions: StokerPermissions | null) {
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    return (
        field.sorting &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (field.sorting === true || !field.sorting.roles || field.sorting.roles.includes(permissions.Role!))
    )
}

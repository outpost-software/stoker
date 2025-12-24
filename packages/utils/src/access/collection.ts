import { CollectionField, CollectionPermissions, CollectionSchema, StokerPermissions } from "@stoker-platform/types"

export const collectionAuthAccess = (permissions: CollectionPermissions) => {
    return !!permissions.auth
}

export const collectionAccess = (
    operation: "Read" | "Create" | "Update" | "Delete",
    permissions: CollectionPermissions,
) => {
    if (permissions?.operations) {
        return permissions.operations.includes(operation)
    }
    return
}

export const collectionSomeWriteAccess = (permissions: CollectionPermissions) => {
    if (permissions?.operations) {
        return permissions.operations.some(
            (operation: string) => operation === "Create" || operation === "Update" || operation === "Delete",
        )
    }
    return
}

export const collectionAllWriteAccess = (permissions: CollectionPermissions) => {
    if (permissions?.operations) {
        return permissions.operations.every(
            (operation: string) => operation === "Create" || operation === "Update" || operation === "Delete",
        )
    }
    return
}

export const privateFieldAccess = (field: CollectionField, permissions?: StokerPermissions) => {
    if (!permissions) return true
    if (!permissions.Role) return false
    return field.access?.includes(permissions.Role)
}

export const restrictCreateAccess = (field: CollectionField, permissions?: StokerPermissions) => {
    if (field.restrictCreate === true) return false
    else if (permissions && typeof field.restrictCreate === "object") {
        if (!permissions.Role) return false
        return field.restrictCreate?.includes(permissions.Role)
    }
    return true
}

export const restrictUpdateAccess = (field: CollectionField, permissions?: StokerPermissions) => {
    if (field.restrictUpdate === true) return false
    else if (permissions && typeof field.restrictUpdate === "object") {
        if (!permissions.Role) return false
        return field.restrictUpdate?.includes(permissions.Role)
    }
    return true
}

export const canUpdateField = (
    collection: CollectionSchema,
    field: CollectionField,
    permissions: StokerPermissions,
) => {
    const { labels } = collection
    return (
        permissions.collections &&
        // eslint-disable-next-line security/detect-object-injection
        collectionAccess("Update", permissions.collections[labels.collection]) &&
        (!field.access || privateFieldAccess(field, permissions)) &&
        restrictUpdateAccess(field, permissions) &&
        !(
            collection.auth &&
            !permissions.collections?.[labels.collection].auth &&
            ["Enabled", "Role", "Name", "Email", "Photo_URL"].includes(field.name)
        )
    )
}

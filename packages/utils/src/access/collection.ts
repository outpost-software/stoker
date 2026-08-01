import {
    CollectionField,
    CollectionPermissions,
    CollectionSchema,
    FieldAccessCondition,
    StokerPermissions,
} from "@stoker-platform/types"
import { evaluateFieldAccessCondition, fieldAccessGroupAccess, isFieldAccessGroupReference } from "./fieldAccess.js"

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

export const privateFieldAccess = (
    field: CollectionField,
    permissions?: StokerPermissions,
    collection?: CollectionSchema,
    claims?: Record<string, unknown>,
) => {
    if (!permissions) return true
    if (!permissions.Role) return false
    if (isFieldAccessGroupReference(field.access)) {
        if (!collection || !claims) return false
        return fieldAccessGroupAccess(field, collection, permissions, claims)
    }
    return field.access?.includes(permissions.Role)
}

const restrictWriteAccess = (
    restriction: CollectionField["restrictCreate" | "restrictUpdate"],
    permissions: StokerPermissions,
    collectionName?: string,
    claims?: Record<string, unknown>,
) => {
    if (restriction === true) return false
    if (Array.isArray(restriction)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return restriction.includes(permissions.Role!)
    }
    if (typeof restriction === "object" && restriction !== null) {
        if (!collectionName || !claims) return false
        return evaluateFieldAccessCondition(restriction as FieldAccessCondition, collectionName, permissions, claims)
    }
    return true
}

export const restrictCreateAccess = (
    field: CollectionField,
    permissions?: StokerPermissions,
    collectionName?: string,
    claims?: Record<string, unknown>,
) => {
    if (!permissions) return true
    if (!permissions.Role) return false
    return restrictWriteAccess(field.restrictCreate, permissions, collectionName, claims)
}

export const restrictUpdateAccess = (
    field: CollectionField,
    permissions?: StokerPermissions,
    collectionName?: string,
    claims?: Record<string, unknown>,
) => {
    if (!permissions) return true
    if (!permissions.Role) return false
    return restrictWriteAccess(field.restrictUpdate, permissions, collectionName, claims)
}

export const canUpdateField = (
    collection: CollectionSchema,
    field: CollectionField,
    permissions: StokerPermissions,
    claims: Record<string, unknown>,
) => {
    const { labels } = collection
    return (
        permissions.collections &&
        // eslint-disable-next-line security/detect-object-injection
        collectionAccess("Update", permissions.collections[labels.collection]) &&
        (!field.access || privateFieldAccess(field, permissions, collection, claims)) &&
        restrictUpdateAccess(field, permissions, labels.collection, claims) &&
        !(
            collection.auth &&
            !permissions.collections?.[labels.collection].auth &&
            ["Enabled", "Role", "Name", "Email", "Photo_URL"].includes(field.name)
        )
    )
}

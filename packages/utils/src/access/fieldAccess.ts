import {
    CollectionField,
    CollectionSchema,
    FieldAccessCondition,
    FieldAccessGroupReference,
    StokerPermissions,
    StokerRole,
} from "@stoker-platform/types"

export const isFieldAccessGroupReference = (
    access?: StokerRole[] | FieldAccessGroupReference,
): access is FieldAccessGroupReference => {
    return !!access && !Array.isArray(access)
}

export const getFieldAccessRoles = (access?: StokerRole[] | FieldAccessGroupReference): StokerRole[] | undefined => {
    return Array.isArray(access) ? access : undefined
}

export const fieldRoleProjectionAccess = (field: CollectionField, role: StokerRole) => {
    if (!field.access) return true
    if (isFieldAccessGroupReference(field.access)) return false
    return field.access.includes(role)
}

export const getFieldAccessGroupCondition = (
    field: CollectionField,
    collection: CollectionSchema,
): FieldAccessCondition | undefined => {
    if (!isFieldAccessGroupReference(field.access)) return
    return collection.fieldAccessGroups?.[field.access.group]
}

export const getFieldAccessGroupFields = (collection: CollectionSchema): Record<string, CollectionField[]> => {
    const groups: Record<string, CollectionField[]> = {}
    Object.keys(collection.fieldAccessGroups || {}).forEach((key) => {
        // eslint-disable-next-line security/detect-object-injection
        groups[key] = []
    })
    collection.fields.forEach((field) => {
        if (isFieldAccessGroupReference(field.access)) {
            const { group } = field.access
            // eslint-disable-next-line security/detect-object-injection
            if (groups[group]) groups[group].push(field)
        }
    })
    return groups
}

export const evaluateFieldAccessCondition = (
    condition: FieldAccessCondition,
    collectionName: string,
    permissions?: StokerPermissions,
    claims?: Record<string, unknown>,
): boolean => {
    if (!permissions) return true
    // eslint-disable-next-line security/detect-object-injection
    const collectionPermissions = permissions.collections?.[collectionName]

    const checks: boolean[] = []

    if (condition.collectionAuth !== undefined) {
        checks.push(!!collectionPermissions?.auth === condition.collectionAuth)
    }

    if (condition.roles) {
        checks.push(!!permissions.Role && condition.roles.includes(permissions.Role))
    }

    if (condition.claims) {
        checks.push(
            Object.entries(condition.claims).every(([claim, expected]) => {
                // eslint-disable-next-line security/detect-object-injection
                let value = claims?.[claim]
                if (value === undefined && claim === "role") value = permissions.Role
                if (Array.isArray(expected)) return expected.some((item) => item === value)
                return value === expected
            }),
        )
    }

    if (condition.restrictions) {
        const { recordOwner, recordUser, recordProperty, restrictEntities } = condition.restrictions
        checks.push(
            (recordOwner === undefined || !!collectionPermissions?.recordOwner?.active === recordOwner) &&
                (recordUser === undefined || !!collectionPermissions?.recordUser?.active === recordUser) &&
                (recordProperty === undefined || !!collectionPermissions?.recordProperty?.active === recordProperty) &&
                (restrictEntities === undefined || !!collectionPermissions?.restrictEntities === restrictEntities),
        )
    }

    if (checks.length === 0) return false
    if (condition.match === "all") return checks.every(Boolean)
    return checks.some(Boolean)
}

export const fieldAccessGroupAccess = (
    field: CollectionField,
    collection: CollectionSchema,
    permissions: StokerPermissions,
    claims: Record<string, unknown>,
) => {
    const condition = getFieldAccessGroupCondition(field, collection)
    if (!condition) return false
    return evaluateFieldAccessCondition(condition, collection.labels.collection, permissions, claims)
}

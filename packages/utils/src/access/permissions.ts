import {
    AccessOperations,
    AccessRestriction,
    AttributeRestriction,
    CollectionPermissions,
    CollectionSchema,
    CollectionsSchema,
    EntityRestriction,
    PermissionWriteRestriction,
    StokerPermissions,
    StokerRecord,
    StokerRole,
} from "@stoker-platform/types"
import isEqual from "lodash/isEqual.js"
import { getField } from "../schema/getField.js"
import { isRelationField } from "../schema/isRelationField.js"
import { collectionAccess, collectionAuthAccess } from "./collection.js"

/* eslint-disable security/detect-object-injection */

const logErrors = true

const validatePermissions = (schema: CollectionsSchema, permissions: StokerPermissions) => {
    let granted = true
    let errorDetails = ""

    Object.keys(permissions).forEach((key) => {
        if (!["Doc_ID", "Role", "Collection", "Enabled", "collections"].includes(key)) {
            granted = false
            errorDetails = "Permissions object must contain Doc_ID, Role, Collection, Enabled, and collections"
            return
        }
    })

    if (!permissions.collections) return granted
    Object.keys(permissions.collections).forEach((key) => {
        if (!Object.keys(schema.collections).includes(key)) {
            errorDetails = `Collection ${key} not found in schema`
            granted = false
            return
        }

        const permissionCollection = schema.collections[key]
        const collectionPermissions = permissions.collections?.[key]
        if (!collectionPermissions) return

        if (!collectionPermissions.operations) {
            errorDetails = `Collection ${key} does not have operations`
            granted = false
            return
        }

        if (
            !Object.keys(collectionPermissions).every((operation) =>
                [
                    "operations",
                    "auth",
                    "restrictEntities",
                    "individualEntities",
                    "parentEntities",
                    "parentPropertyEntities",
                    "recordProperty",
                    "recordUser",
                    "recordOwner",
                ].includes(operation),
            )
        ) {
            errorDetails = `Collection ${key} has invalid properties`
            granted = false
            return
        }

        if (
            !collectionPermissions.operations.every((operation) =>
                ["Read", "Create", "Update", "Delete"].includes(operation),
            )
        ) {
            errorDetails = `Collection ${key} has invalid operations`
            granted = false
            return
        }

        if (
            collectionPermissions.auth &&
            (typeof collectionPermissions.auth !== "boolean" || !permissionCollection.auth)
        ) {
            errorDetails = `Collection ${key} has invalid auth value`
            granted = false
            return
        }

        if (collectionPermissions.restrictEntities && !permissionCollection.access.entityRestrictions?.restrictions) {
            errorDetails = `Collection ${key} has invalid restrictEntities value`
            granted = false
            return
        }

        Object.entries(collectionPermissions).forEach(([operation, values]) => {
            if (operation !== "operations" && operation !== "auth" && operation !== "restrictEntities") {
                let restrictionType: AccessRestriction["type"]
                if (operation === "recordOwner") {
                    restrictionType = "Record_Owner"
                } else if (operation === "recordUser") {
                    restrictionType = "Record_User"
                } else if (operation === "recordProperty") {
                    restrictionType = "Record_Property"
                } else if (operation === "individualEntities") {
                    restrictionType = "Individual"
                } else if (operation === "parentEntities") {
                    restrictionType = "Parent"
                } else if (operation === "parentPropertyEntities") {
                    restrictionType = "Parent_Property"
                }
                const attributeRestrictions = permissionCollection.access.attributeRestrictions?.filter(
                    (restriction) =>
                        restriction.type === restrictionType &&
                        restriction.roles.some((role) => role.role === permissions.Role),
                ) as AttributeRestriction[] | undefined
                const entityRestrictions = permissionCollection.access.entityRestrictions?.restrictions?.filter(
                    (restriction) =>
                        restriction.type === restrictionType &&
                        restriction.roles.some((role) => role.role === permissions.Role),
                ) as EntityRestriction[] | undefined

                if (
                    permissionCollection.access.entityRestrictions?.assignable &&
                    !(
                        Array.isArray(permissionCollection.access.entityRestrictions.assignable) &&
                        permissionCollection.access.entityRestrictions.assignable.every((assignable) =>
                            schema.config.roles.includes(assignable),
                        )
                    )
                ) {
                    errorDetails = `Collection ${key} has invalid entity restrictions assignable value`
                    granted = false
                    return
                }

                if (attributeRestrictions?.length || entityRestrictions?.length) {
                    if (
                        operation === "Record_Owner" ||
                        operation === "Record_User" ||
                        operation === "Record_Property"
                    ) {
                        const restrictionKeys = Object.keys(values)
                        if (
                            restrictionKeys.length !== 1 ||
                            restrictionKeys[0] !== "active" ||
                            typeof values.active !== "boolean"
                        ) {
                            errorDetails = `Collection ${key} has invalid attribute restriction value`
                            granted = false
                            return
                        }
                    }
                    if (operation === "Individual") {
                        if (!Array.isArray(values)) {
                            errorDetails = `Collection ${key} has invalid individual entities value`
                            granted = false
                            return
                        }
                    }
                    if (operation === "Parent") {
                        const restrictionKeys = Object.keys(values)
                        if (
                            !(
                                restrictionKeys.length === 1 &&
                                Object.keys(schema.collections).includes(restrictionKeys[0]) &&
                                Array.isArray(values[restrictionKeys[0]])
                            )
                        ) {
                            errorDetails = `Collection ${key} has invalid parent entities value`
                            granted = false
                            return
                        }
                    }
                    if (operation === "Parent_Property") {
                        const restrictionKeys = Object.keys(values)
                        if (
                            !(
                                restrictionKeys.length === 1 &&
                                Object.keys(schema.collections).includes(restrictionKeys[0]) &&
                                typeof values[restrictionKeys[0]] === "object" &&
                                values[restrictionKeys[0]] !== null
                            )
                        ) {
                            errorDetails = `Collection ${key} has invalid parent property entities value`
                            granted = false
                            return
                        }
                    }
                } else {
                    errorDetails = `Collection ${key} has invalid restriction type ${operation}`
                    granted = false
                    return
                }
            }
        })
    })
    if (logErrors && errorDetails) {
        console.error(`PERMISSION_DENIED: ${errorDetails}`)
    }
    return granted
}

const enforceRoleRestrictions = (schema: CollectionsSchema, permissions: StokerPermissions, role: StokerRole) => {
    let granted = true
    let errorDetails = ""

    Object.values(schema.collections)
        .filter((authCollection) => authCollection.auth)
        .forEach((authCollection) => {
            const collectionPermissions = permissions.collections?.[authCollection.labels.collection]
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (collectionPermissions?.auth && !authCollection.access.auth?.includes(permissions.Role!)) {
                errorDetails = "Record cannot have auth access to collection"
                granted = false
                return
            }
        })

    for (const collection of Object.values(schema.collections)) {
        const { labels, access, fields } = collection
        const { operations, attributeRestrictions, entityRestrictions } = access
        const assignable = operations.assignable
        const collectionPermissions = permissions.collections?.[labels.collection]
        const operationTypes = ["read", "create", "update", "delete"] as (keyof AccessOperations)[]
        if (assignable !== true && !(typeof assignable === "object" && assignable.includes(role))) {
            operationTypes.forEach((operationType) => {
                const operationTypeUpper = (operationType.charAt(0).toUpperCase() + operationType.slice(1)) as
                    | "Read"
                    | "Create"
                    | "Update"
                    | "Delete"
                if (operationType !== "assignable") {
                    const hasAccessOperation = !!access.operations[operationType]?.includes(role)
                    const hasCollectionPermission = !!collectionPermissions?.operations.includes(operationTypeUpper)
                    if (!hasAccessOperation && hasCollectionPermission) {
                        errorDetails = `Collection ${labels.collection} has excess ${operationType} operation for role ${role}`
                        granted = false
                        return
                    }
                    if (hasAccessOperation && !hasCollectionPermission) {
                        errorDetails = `Collection ${labels.collection} has missing ${operationType} operation for role ${role}`
                        granted = false
                        return
                    }
                }
            })
        } else {
            operationTypes.forEach((operationType) => {
                const operationTypeUpper = (operationType.charAt(0).toUpperCase() + operationType.slice(1)) as
                    | "Read"
                    | "Create"
                    | "Update"
                    | "Delete"
                if (operationType !== "assignable") {
                    const hasAccessOperation = !!access.operations[operationType]?.includes(role)
                    const hasCollectionPermission = !!collectionPermissions?.operations.includes(operationTypeUpper)
                    if (!hasAccessOperation && hasCollectionPermission) {
                        errorDetails = `Collection ${labels.collection} has excess ${operationType} operation for role ${role}`
                        granted = false
                        return
                    }
                }
            })
        }

        if (!attributeRestrictions && !entityRestrictions) continue

        attributeRestrictions?.forEach((attributeRestriction) => {
            for (const restrictionRole of attributeRestriction.roles) {
                if (restrictionRole.role === role && !restrictionRole.assignable) {
                    if (attributeRestriction.type === "Record_Owner") {
                        const recordOwner = permissions.collections?.[labels.collection]?.recordOwner
                        if (!recordOwner?.active) {
                            errorDetails = `Collection ${labels.collection} is missing Record_Owner restriction for role ${role}`
                            granted = false
                            return
                        }
                    }
                    if (attributeRestriction.type === "Record_User") {
                        const recordUser = permissions.collections?.[labels.collection]?.recordUser
                        if (!recordUser?.active) {
                            errorDetails = `Collection ${labels.collection} is missing Record_User restriction for role ${role}`
                            granted = false
                            return
                        }
                    }
                    if (attributeRestriction.type === "Record_Property") {
                        const recordProperty = permissions.collections?.[labels.collection]?.recordProperty
                        if (!recordProperty?.active) {
                            errorDetails = `Collection ${labels.collection} is missing Record_Property restriction for role ${role}`
                            granted = false
                            return
                        }
                    }
                }
            }
        })

        if (entityRestrictions?.assignable?.includes(role)) continue

        let hasEntityRestriction = false
        entityRestrictions?.restrictions?.forEach((entityRestriction) => {
            for (const restrictionRole of entityRestriction.roles) {
                if (restrictionRole.role === role) {
                    hasEntityRestriction = true
                    if (entityRestriction.type === "Individual") {
                        const individualEntities = permissions.collections?.[labels.collection]?.individualEntities
                        if (!individualEntities) {
                            errorDetails = `Collection ${labels.collection} is missing individual entities`
                            granted = false
                            return
                        }
                    }
                    if (entityRestriction.type === "Parent") {
                        const field = getField(fields, entityRestriction.collectionField)
                        if (!isRelationField(field)) {
                            granted = false
                            return
                        }
                        const parentEntities = permissions.collections?.[labels.collection]?.parentEntities
                        if (!parentEntities) {
                            errorDetails = `Collection ${labels.collection} is missing parent entities`
                            granted = false
                            return
                        }
                    }
                    if (entityRestriction.type === "Parent_Property") {
                        const field = getField(fields, entityRestriction.collectionField)
                        if (!isRelationField(field)) {
                            granted = false
                            return
                        }
                        const parentPropertyEntities =
                            permissions.collections?.[labels.collection]?.parentPropertyEntities?.[field.collection]
                        if (!parentPropertyEntities) {
                            errorDetails = `Collection ${labels.collection} is missing parent property entities`
                            granted = false
                            return
                        }
                    }
                }
            }
        })

        if (hasEntityRestriction && !permissions.collections?.[labels.collection]?.restrictEntities) {
            errorDetails = `Collection ${labels.collection} must have restrictEntities set to true`
            granted = false
            return
        }
    }
    if (logErrors && errorDetails) {
        console.error(`PERMISSION_DENIED: ${errorDetails}`)
    }
    return granted
}

const restrictedPermissions = (
    operation: "create" | "update" | "delete",
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    currentUserRole: StokerRole,
    role: StokerRole,
    permissions?: StokerPermissions,
    originalRecord?: StokerRecord,
    originalRole?: StokerRole,
    originalPermissions?: StokerPermissions,
) => {
    const { access } = collectionSchema
    const { permissionWriteRestrictions } = access

    let granted = true
    let errorDetails = ""

    const writeableRoles = permissionWriteRestrictions?.filter(
        (restriction: PermissionWriteRestriction) => currentUserRole === restriction.userRole,
    )
    if (
        writeableRoles?.length &&
        !writeableRoles.some((restriction: PermissionWriteRestriction) => restriction.recordRole === role)
    ) {
        errorDetails = `User ${currentUserRole} does not have write access to record with role ${role}`
        granted = false
        return granted
    }
    if (
        operation === "update" &&
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        originalRecord!.User_ID &&
        writeableRoles?.length &&
        !writeableRoles.some((restriction: PermissionWriteRestriction) => restriction.recordRole === originalRole)
    ) {
        errorDetails = `User ${currentUserRole} does not have write access to record with role ${role}`
        granted = false
        return granted
    }

    permissionWriteRestrictions?.forEach((restriction: PermissionWriteRestriction) => {
        if (currentUserRole === restriction.userRole && restriction.recordRole === role) {
            if (operation !== "delete" && permissions) {
                Object.keys(schema.collections).forEach((collectionName) => {
                    const collectionPermissions = permissions.collections?.[collectionName]
                    const originalCollectionPermissions = originalPermissions?.collections?.[collectionName]

                    if (operation === "update" && isEqual(collectionPermissions, originalCollectionPermissions)) return

                    if (collectionPermissions) {
                        const collectionPermission = restriction.collections.some(
                            (collection) => collection.collection === collectionName,
                        )
                        if (!collectionPermission) {
                            errorDetails = `User ${currentUserRole} does not have write access to collection ${collectionName}`
                            granted = false
                            return
                        } else if (collectionPermission) {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            const collectionRestrictions = restriction.collections.find(
                                (collection) => collection.collection === collectionName,
                            )!

                            if (
                                !(
                                    collectionPermissions.operations.every((operation) =>
                                        collectionRestrictions.operations.includes(operation),
                                    ) ||
                                    (operation === "update" &&
                                        isEqual(
                                            collectionPermissions.operations,
                                            originalCollectionPermissions?.operations,
                                        ))
                                )
                            ) {
                                errorDetails = `User ${currentUserRole} does not have write access to all included operations for collection ${collectionName}`
                                granted = false
                                return
                            }

                            if (
                                !collectionRestrictions.auth &&
                                collectionPermissions.auth &&
                                !(
                                    operation === "update" &&
                                    isEqual(collectionPermissions.auth, originalCollectionPermissions?.auth)
                                )
                            ) {
                                errorDetails = `User ${currentUserRole} does not have write access to auth for collection ${collectionName}`
                                granted = false
                                return
                            }

                            const attributeRestrictionKeys: { [key: string]: string } = {
                                recordOwner: "Record_Owner",
                                recordUser: "Record_User",
                                recordProperty: "Record_Property",
                            }

                            Object.keys(attributeRestrictionKeys).forEach((attributeRestrictionKey) => {
                                const attributeRestrictionType = attributeRestrictionKeys[
                                    attributeRestrictionKey
                                ] as AttributeRestriction["type"]
                                if (
                                    collectionRestrictions.attributeRestrictions?.includes(attributeRestrictionType) &&
                                    !(
                                        collectionPermissions[
                                            attributeRestrictionKey as "recordOwner" | "recordUser" | "recordProperty"
                                        ]?.active ||
                                        (operation === "update" &&
                                            isEqual(
                                                collectionPermissions[
                                                    attributeRestrictionKey as
                                                        | "recordOwner"
                                                        | "recordUser"
                                                        | "recordProperty"
                                                ],
                                                originalCollectionPermissions?.[
                                                    attributeRestrictionKey as
                                                        | "recordOwner"
                                                        | "recordUser"
                                                        | "recordProperty"
                                                ],
                                            ))
                                    )
                                ) {
                                    errorDetails = `User ${currentUserRole} does not have write access to attribute restriction ${attributeRestrictionKey} for collection ${collectionName}`
                                    granted = false
                                    return
                                }
                            })

                            if (
                                collectionRestrictions.restrictEntities &&
                                !collectionPermissions.restrictEntities &&
                                !(
                                    operation === "update" &&
                                    isEqual(
                                        collectionPermissions.restrictEntities,
                                        originalCollectionPermissions?.restrictEntities,
                                    )
                                )
                            ) {
                                errorDetails = `User ${currentUserRole} does not have write access to restrictEntities for collection ${collectionName}`
                                granted = false
                                return
                            }
                        }
                    }
                })
            }
        }
    })
    if (logErrors && errorDetails) {
        console.error(`PERMISSION_DENIED: ${errorDetails}`)
    }
    return granted
}

const restrictPrivileges = (
    schema: CollectionsSchema,
    currentUserPermissions: StokerPermissions,
    permissions: StokerPermissions,
    originalPermissions: StokerPermissions,
) => {
    let granted = true
    let errorDetails = ""

    Object.values(schema.collections).forEach((collection) => {
        const collectionPermissions = permissions.collections?.[collection.labels.collection]
        const originalCollectionPermissions = originalPermissions?.collections?.[collection.labels.collection]

        const currentUserCollectionPermissions = currentUserPermissions?.collections?.[
            collection.labels.collection
        ] as CollectionPermissions

        if (
            collectionPermissions?.auth &&
            !originalCollectionPermissions?.auth &&
            !collectionAuthAccess(currentUserCollectionPermissions)
        ) {
            errorDetails = `User does not have auth access to collection ${collection.labels.collection}`
            granted = false
            return
        }

        for (const operation of collectionPermissions?.operations || []) {
            if (!originalCollectionPermissions?.operations.includes(operation)) {
                if (
                    !collectionAccess("Read", currentUserCollectionPermissions) ||
                    !collectionAccess(operation, currentUserCollectionPermissions)
                ) {
                    errorDetails = `User does not have ${operation.toLowerCase()} access to collection ${collection.labels.collection}`
                    granted = false
                    return
                }
            }
        }

        if (
            !collectionPermissions?.recordOwner &&
            originalCollectionPermissions?.recordOwner &&
            currentUserCollectionPermissions?.recordOwner
        ) {
            errorDetails = `User does not have write access to recordOwner for collection ${collection.labels.collection}`
            granted = false
            return
        }
        if (
            !collectionPermissions?.recordUser &&
            originalCollectionPermissions?.recordUser &&
            currentUserCollectionPermissions?.recordUser
        ) {
            errorDetails = `User does not have write access to recordUser for collection ${collection.labels.collection}`
            granted = false
            return
        }
        if (
            !collectionPermissions?.recordProperty &&
            originalCollectionPermissions?.recordProperty &&
            currentUserCollectionPermissions?.recordProperty
        ) {
            errorDetails = `User does not have write access to recordProperty for collection ${collection.labels.collection}`
            granted = false
            return
        }
        if (
            !collectionPermissions?.restrictEntities &&
            originalCollectionPermissions?.restrictEntities &&
            currentUserCollectionPermissions?.restrictEntities
        ) {
            errorDetails = `User does not have write access to restrictEntities for collection ${collection.labels.collection}`
            granted = false
            return
        }
    })

    if (logErrors && errorDetails) {
        console.error(`PERMISSION_DENIED: ${errorDetails}`)
    }
    return granted
}

/* eslint-enable security/detect-object-injection */

export const permissionsWriteAccess = (
    operation: "create" | "update" | "delete",
    record: StokerRecord,
    docId: string,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    currentUserId?: string,
    currentUserPermissions?: StokerPermissions,
    permissions?: StokerPermissions,
    originalPermissions?: StokerPermissions,
    originalRecord?: StokerRecord,
    userOperation?: string,
) => {
    const { labels } = collectionSchema

    let granted = true
    let errorDetails = ""

    if (!record.Role) {
        errorDetails = "Record does not have a role"
        granted = false
        return granted
    }

    // Ensure original records are provided for update operations

    if (operation === "update" && !originalRecord) {
        errorDetails = "Original record is required for update operations"
        granted = false
        return granted
    }

    if (operation === "update" && currentUserId && userOperation === "update" && permissions && !originalPermissions) {
        errorDetails = "Original permissions are required for this operation"
        granted = false
        return granted
    }

    // Operations that assess the current user's permissions

    if (currentUserId) {
        if (!currentUserPermissions?.Role) {
            errorDetails = "Current user does not have a role"
            granted = false
            return granted
        }

        if (
            !restrictedPermissions(
                operation,
                collectionSchema,
                schema,
                currentUserPermissions.Role,
                record.Role,
                permissions,
                originalRecord,
                originalRecord?.Role,
                originalPermissions,
            )
        ) {
            granted = false
            return granted
        }

        if (operation === "update" && userOperation !== "delete" && originalRecord?.User_ID) {
            if (record.User_ID !== originalRecord.User_ID) {
                errorDetails = "User ID does not match original user ID"
                granted = false
                return granted
            }
        }
        if (operation === "update" && originalRecord) {
            if (originalRecord.User_ID) {
                if (
                    currentUserId === originalRecord.User_ID &&
                    (permissions ||
                        record.Role !== originalRecord.Role ||
                        (record.Enabled !== undefined && record.Enabled !== originalRecord.Enabled))
                ) {
                    errorDetails = "User cannot update their own record"
                    granted = false
                    return granted
                }
            }
        }
        if (operation === "delete") {
            if (currentUserId === record.User_ID) {
                errorDetails = "User cannot delete their own record"
                granted = false
                return granted
            }
        }
    }

    // Permissions and record validation

    if (operation === "delete" || userOperation === "delete" || !permissions) {
        return granted
    }

    if (!permissions.Role) {
        errorDetails = "Permissions do not have a role"
        granted = false
        return granted
    }

    if (!validatePermissions(schema, permissions)) granted = false

    if (permissions.Collection && permissions.Collection !== labels.collection) {
        errorDetails = "Permissions collection does not match record collection"
        granted = false
        return granted
    }
    if (permissions.Role !== record.Role) {
        errorDetails = "Permissions role does not match record role"
        granted = false
        return granted
    }
    if (permissions.Enabled !== undefined && !!permissions.Enabled !== !!record.Enabled) {
        errorDetails = "Permissions enabled state does not match record enabled state"
        granted = false
        return granted
    }
    if (permissions.Doc_ID && permissions.Doc_ID !== docId) {
        errorDetails = "Permissions doc ID does not match record doc ID"
        granted = false
        return granted
    }

    if (!enforceRoleRestrictions(schema, permissions, permissions.Role)) {
        granted = false
        return granted
    }

    if (currentUserId && currentUserPermissions && originalPermissions) {
        if (!restrictPrivileges(schema, currentUserPermissions, permissions, originalPermissions)) {
            granted = false
            return granted
        }
    }

    if (logErrors && errorDetails) {
        console.error(`PERMISSION_DENIED: ${errorDetails}`)
    }
    return granted
}

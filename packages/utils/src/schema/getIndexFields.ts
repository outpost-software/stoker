import type {
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    Query,
    StokerCollection,
    StokerPermissions,
    StokerRole,
    SystemField,
    RoleGroup,
} from "@stoker-platform/types"
import { getField } from "./getField.js"
import { getSystemFieldsSchema } from "./getSystemFieldsSchema.js"
import { systemFields } from "./system-fields.js"
import { getAccessFields } from "./getAccessFields.js"
import { getDependencyFields } from "./getDependencyFields.js"
import { roleHasOperationAccess } from "../access/roleHasOperationAccess.js"
import { isRelationField } from "./isRelationField.js"
import { fieldRoleProjectionAccess, getFieldAccessGroupFields } from "../access/fieldAccess.js"

export const getRoleFields = (collection: CollectionSchema, role: StokerRole) => {
    const indexFields: CollectionField[] = []
    const { fields, roleSystemFields, preloadCache, queries } = collection

    const systemFieldsSchema = getSystemFieldsSchema()

    indexFields.push({
        name: "Collection_Path",
        type: "Array",
        required: true,
    })

    fields.forEach((field) => {
        if (fieldRoleProjectionAccess(field, role)) {
            indexFields.push(field)
        }
    })

    roleSystemFields
        ?.filter(
            (systemField) =>
                (!systemField.roles || systemField.roles.includes(role)) && systemField.field !== "Collection_Path",
        )
        .forEach((systemField) => {
            indexFields.push(getField(systemFieldsSchema, systemField.field))
        })

    if (preloadCache?.range) {
        preloadCache.range.fields.forEach((field) => {
            if (systemFields.includes(field as SystemField)) {
                indexFields.push(getField(systemFieldsSchema, field))
            }
        })
    }

    queries?.forEach((query: Query) => {
        const queryField = getField(fields.concat(systemFieldsSchema), query.field)
        if (
            (!query.roles || query.roles.includes(role)) &&
            queryField &&
            fieldRoleProjectionAccess(queryField, role) &&
            systemFields.includes(query.field as SystemField)
        ) {
            indexFields.push(getField(systemFieldsSchema, query.field))
        }
    })

    const accessFields = getAccessFields(collection, role)
    accessFields.forEach((field) => {
        if (systemFields.includes(field.name as SystemField)) {
            indexFields.push(getField(systemFieldsSchema, field.name))
        }
    })

    return [...new Set(indexFields)]
}

export const getDependencyAccessFields = (
    field: CollectionField,
    collection: CollectionSchema,
    schema: CollectionsSchema,
) => {
    const indexFields: CollectionField[] = []
    const { fields, preloadCache } = collection

    const systemFieldsSchema = getSystemFieldsSchema()
    const dependentRoles = new Set<StokerRole>()
    const dependentFields = getDependencyFields(collection, schema)
    Object.entries(dependentFields).map(([fieldName, collectionValues]) => {
        if (field.name === fieldName) {
            Object.values(collectionValues).forEach((roles) => {
                roles.forEach((role) => {
                    dependentRoles.add(role)
                })
            })
        }
    })
    dependentRoles.forEach((role) => {
        indexFields.push(...getAccessFields(collection, role))
    })

    if (preloadCache?.range) {
        preloadCache.range.fields.forEach((field) => {
            if (systemFields.includes(field as SystemField)) {
                indexFields.push(getField(systemFieldsSchema, field))
            } else if (
                Array.from(dependentRoles).some((role) => fieldRoleProjectionAccess(getField(fields, field), role))
            ) {
                indexFields.push(getField(fields, field))
            }
        })
    }

    return [...new Set(indexFields)]
}

export const getDependencyIndexFields = (
    field: CollectionField,
    collection: CollectionSchema,
    schema: CollectionsSchema,
) => {
    const indexFields: CollectionField[] = []
    const { fields, softDelete } = collection

    indexFields.push({
        name: "Collection_Path",
        type: "Array",
        required: true,
    })

    indexFields.push({
        name: "id",
        type: "String",
        required: true,
    })

    const constraints: string[] = []
    const dependentFields = getDependencyFields(collection, schema)
    Object.values(dependentFields).forEach((collectionValues) => {
        Object.keys(collectionValues).forEach((collectionName) => {
            // eslint-disable-next-line security/detect-object-injection
            const dependentCollection = schema.collections[collectionName]
            dependentCollection.fields.forEach((collectionField) => {
                if (isRelationField(collectionField) && collectionField.collection === collection.labels.collection) {
                    if (
                        collectionField.dependencyFields?.some(
                            (dependencyField) => dependencyField.field === field.name,
                        ) &&
                        collectionField.constraints
                    ) {
                        collectionField.constraints.forEach((constraint) => {
                            constraints.push(constraint[0])
                        })
                    }
                }
            })
        })
    })
    constraints.forEach((constraint) => {
        indexFields.push(getField(fields, constraint))
    })

    if (softDelete) {
        const softDeleteField = getField(fields, softDelete.archivedField)
        if (softDeleteField) {
            indexFields.push(softDeleteField)
        }
    }

    indexFields.push(...getDependencyAccessFields(field, collection, schema))

    return [...new Set(indexFields)]
}

export const getFieldAccessGroupRoles = (groupKey: string, collection: CollectionSchema, roleGroup: RoleGroup) => {
    // eslint-disable-next-line security/detect-object-injection
    const applicableRoles = collection.fieldAccessGroups?.[groupKey]?.applicableRoles || []
    return roleGroup.roles.filter((role) => applicableRoles.includes(role))
}

export const getFieldAccessGroupKey = (groupKey: string, roleGroupKey: string) => {
    return `${groupKey}-${roleGroupKey}`
}

export const getFieldAccessGroupIndexFields = (
    groupKey: string,
    collection: CollectionSchema,
    roleGroup: RoleGroup,
) => {
    // eslint-disable-next-line security/detect-object-injection
    if (!collection.fieldAccessGroups?.[groupKey]) return []
    const overlayRoles = getFieldAccessGroupRoles(groupKey, collection, roleGroup)
    if (overlayRoles.length === 0) return []
    const indexFields: CollectionField[] = []
    const { fields, softDelete, preloadCache, roleSystemFields, queries } = collection
    const systemFieldsSchema = getSystemFieldsSchema()

    indexFields.push({
        name: "Collection_Path",
        type: "Array",
        required: true,
    })

    indexFields.push({
        name: "id",
        type: "String",
        required: true,
    })

    // eslint-disable-next-line security/detect-object-injection
    const groupFields = getFieldAccessGroupFields(collection)[groupKey] || []
    indexFields.push(...groupFields)

    if (softDelete) {
        const softDeleteField = getField(fields, softDelete.archivedField)
        if (softDeleteField && !groupFields.includes(softDeleteField)) {
            indexFields.push(softDeleteField)
        }
    }

    if (preloadCache?.range) {
        preloadCache.range.fields.forEach((field) => {
            if (systemFields.includes(field as SystemField)) {
                indexFields.push(getField(systemFieldsSchema, field))
            } else if (overlayRoles.some((role) => fieldRoleProjectionAccess(getField(fields, field), role))) {
                indexFields.push(getField(fields, field))
            }
        })
    }

    roleSystemFields
        ?.filter(
            (systemField) =>
                systemField.field !== "Collection_Path" &&
                overlayRoles.some((role) => !systemField.roles || systemField.roles.includes(role)),
        )
        .forEach((systemField) => {
            indexFields.push(getField(systemFieldsSchema, systemField.field))
        })

    queries?.forEach((query: Query) => {
        const queryField = getField(fields.concat(systemFieldsSchema), query.field)
        if (
            queryField &&
            overlayRoles.some(
                (role) => (!query.roles || query.roles.includes(role)) && fieldRoleProjectionAccess(queryField, role),
            )
        ) {
            indexFields.push(queryField)
        }
    })

    for (const role of overlayRoles) {
        indexFields.push(...getAccessFields(collection, role))
    }

    return [...new Set(indexFields)]
}

export const getRoleGroups = (collection: CollectionSchema, schema: CollectionsSchema) => {
    const { preloadCache } = collection
    const roleGroups = new Set<RoleGroup>()

    for (const role of schema.config.roles) {
        if (!roleHasOperationAccess(collection, role, "read")) continue
        const roleFields = getRoleFields(collection, role)
        let found = false
        if (roleGroups.size === 0) {
            roleGroups.add({ key: "1", roles: [role], fields: roleFields })
            found = true
        } else {
            for (const group of roleGroups) {
                if (
                    roleFields.length === group.fields.length &&
                    roleFields.every((field: CollectionField) =>
                        group.fields.some((groupField) => groupField.name === field.name),
                    ) &&
                    !!preloadCache?.roles.includes(role) ===
                        !!group.roles.every((groupRole) => preloadCache?.roles.includes(groupRole))
                ) {
                    group.roles.push(role)
                    found = true
                }
            }
        }
        if (!found) {
            roleGroups.add({ key: (roleGroups.size + 1).toString(), roles: [role], fields: roleFields })
        }
    }

    return roleGroups
}

export const getRoleGroup = (role: StokerRole, collection: CollectionSchema, schema: CollectionsSchema) => {
    const roleGroups = getRoleGroups(collection, schema)
    for (const group of roleGroups.values()) {
        if (group.roles.includes(role)) {
            return group
        }
    }
    return
}

export const getRoleExcludedFields = (roleGroup: RoleGroup, collection: CollectionSchema) => {
    const { fields } = collection
    const systemFieldsSchema = getSystemFieldsSchema()

    const excludedFields: CollectionField[] = []

    const allFields = [...fields, ...systemFieldsSchema.filter((field) => field.name !== "id")]

    allFields.forEach((field) => {
        if (!roleGroup?.fields.some((groupField) => groupField.name === field.name)) {
            excludedFields.push(field)
        }
    })

    return excludedFields
}

export const getUserRoleGroups = (schema: CollectionsSchema, permissions: StokerPermissions, collections: string[]) => {
    const userRoleGroups: Record<StokerCollection, RoleGroup> = {}
    Object.values(schema.collections).forEach((collection) => {
        if (!collections.includes(collection.labels.collection)) return
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const roleGroup = getRoleGroup(permissions.Role!, collection, schema)
        if (roleGroup) {
            userRoleGroups[collection.labels.collection] = roleGroup
        }
    })
    return userRoleGroups
}

export const getAllRoleGroups = (
    schema: CollectionsSchema,
    permissions?: StokerPermissions,
    collections?: string[],
) => {
    const allRoleGroups: Record<StokerCollection, Set<RoleGroup>> = {}
    Object.values(schema.collections).forEach((collection) => {
        if (collections && !collections.includes(collection.labels.collection)) return
        const roleGroups = getRoleGroups(collection, schema)
        const roleGroupsArray = Array.from(roleGroups)
        roleGroupsArray.map((roleGroup) => {
            roleGroup.fields.forEach((field) => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (permissions && field.access && !fieldRoleProjectionAccess(field, permissions.Role!)) {
                    roleGroup.fields = roleGroup.fields.filter((groupField) => groupField.name !== field.name)
                }
            })
            return roleGroup
        })
        allRoleGroups[collection.labels.collection] = new Set(roleGroupsArray)
    })
    return allRoleGroups
}

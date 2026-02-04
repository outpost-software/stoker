import {
    AttributeRestriction,
    CollectionSchema,
    CollectionsSchema,
    EntityParentFilter,
    EntityRestriction,
    IndividualEntityParentFilter,
    ParentEntityParentFilter,
    ParentPropertyEntityParentFilter,
    RelationField,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import { getField } from "../schema/getField.js"
import { collectionAccess } from "./collection.js"
import {
    getAttributeRestrictions,
    getEntityRestrictions,
    getEntityParentFilters,
} from "../access/getCollectionRestrictions.js"
import { hasDependencyAccess } from "./hasDependencyAccess.js"

const filterAccess = (
    operation: "Read" | "Create" | "Update" | "Delete",
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    userId: string,
    permissions: StokerPermissions,
    record: StokerRecord,
    dependencyAccess?: boolean,
) => {
    const { fields } = collectionSchema
    const collectionPermissions = permissions.collections?.[collectionSchema.labels.collection]

    let granted = true

    if (!collectionPermissions && !dependencyAccess) {
        granted = false
        return
    }

    const hasAttributeRestrictions: AttributeRestriction[] = getAttributeRestrictions(collectionSchema, permissions)
    const hasEntityRestrictions: EntityRestriction[] = getEntityRestrictions(collectionSchema, permissions)
    const hasEntityParentFilters: { parentFilter: EntityParentFilter; parentRestriction: EntityRestriction }[] =
        getEntityParentFilters(collectionSchema, schema, permissions)

    hasAttributeRestrictions
        ?.filter((attributeRestriction) => attributeRestriction.type === "Record_Owner")
        .forEach((attributeRestriction) => {
            if (
                "operations" in attributeRestriction &&
                attributeRestriction.operations &&
                !attributeRestriction.operations.includes(operation)
            )
                return
            if (record.Created_By !== userId) granted = false
        })

    hasAttributeRestrictions
        ?.filter((attributeRestriction) => attributeRestriction.type === "Record_User")
        .forEach((attributeRestriction) => {
            if (
                "operations" in attributeRestriction &&
                attributeRestriction.operations &&
                !attributeRestriction.operations.includes(operation)
            )
                return
            const field = getField(fields, attributeRestriction.collectionField)
            if (!record[`${field.name}_Array`]?.includes(permissions.Doc_ID)) granted = false
        })

    hasAttributeRestrictions
        ?.filter((attributeRestriction) => attributeRestriction.type === "Record_Property")
        .forEach((attributeRestriction) => {
            if (
                "operations" in attributeRestriction &&
                attributeRestriction.operations &&
                !attributeRestriction.operations.includes(operation)
            )
                return
            const field = getField(fields, attributeRestriction.propertyField)
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const recordPropertyRole = attributeRestriction.roles.find((role) => role.role === permissions.Role)!
            if (field.type === "Array") {
                if (!recordPropertyRole.values?.some((value) => record[field.name].includes(value))) granted = false
            } else if (!recordPropertyRole.values?.includes(record[field.name])) granted = false
        })

    let individualEntityRestrictionPassed = true
    let hasIndividualEntityRestriction = false
    hasEntityRestrictions
        ?.filter((entityRestriction) => entityRestriction.type === "Individual")
        .forEach(() => {
            hasIndividualEntityRestriction = true
            if (!collectionPermissions?.individualEntities?.includes(record.id))
                individualEntityRestrictionPassed = false
        })

    let parentEntityRestrictionPassed = true
    let hasParentEntityRestriction = false
    hasEntityRestrictions
        ?.filter((entityRestriction) => entityRestriction.type === "Parent")
        .forEach((entityRestriction) => {
            hasParentEntityRestriction = true
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const field = getField(fields, entityRestriction.collectionField) as RelationField
            if (
                !collectionPermissions?.parentEntities?.some((entity: string) =>
                    record[`${field.name}_Array`].includes(entity),
                )
            )
                parentEntityRestrictionPassed = false
        })

    hasEntityRestrictions
        ?.filter((entityRestriction) => entityRestriction.type === "Parent_Property")
        .forEach((entityRestriction) => {
            hasParentEntityRestriction = true
            const collectionField = getField(fields, entityRestriction.collectionField) as RelationField
            const propertyField = getField(fields, entityRestriction.propertyField)
            if (
                !Object.entries(collectionPermissions?.parentPropertyEntities || {}).some((property) => {
                    const [propertyKey, entities] = property
                    return (
                        propertyKey === record[propertyField.name] &&
                        record[`${collectionField.name}_Array`].some((entity: string) => entities.includes(entity))
                    )
                })
            )
                parentEntityRestrictionPassed = false
        })

    if (hasIndividualEntityRestriction && hasParentEntityRestriction) {
        if (!(individualEntityRestrictionPassed || parentEntityRestrictionPassed)) {
            granted = false
            return
        }
    } else if (!individualEntityRestrictionPassed || !parentEntityRestrictionPassed) {
        granted = false
        return
    }

    let individualParentFilterPassed = true
    let hasIndividualParentFilter = false
    hasEntityParentFilters
        ?.filter((entityParentFilter) => entityParentFilter.parentFilter.type === "Individual")
        .forEach((entityParentFilter) => {
            hasIndividualParentFilter = true
            const { parentFilter } = entityParentFilter as { parentFilter: IndividualEntityParentFilter }
            const collectionField = getField(fields, parentFilter.collectionField) as RelationField
            const parentCollectionPermissions = permissions.collections?.[collectionField.collection]
            if (!parentCollectionPermissions) {
                granted = false
                return
            }
            if (
                !parentCollectionPermissions.individualEntities?.some((entity) =>
                    record[`${collectionField.name}_Array`].includes(entity),
                )
            )
                individualParentFilterPassed = false
        })

    let parentParentFilterPassed = true
    let hasParentParentFilter = false
    hasEntityParentFilters
        ?.filter((entityParentFilter) => entityParentFilter.parentFilter.type === "Parent")
        .forEach((entityParentFilter) => {
            hasParentParentFilter = true
            const { parentFilter } = entityParentFilter as { parentFilter: ParentEntityParentFilter }
            const collectionField = getField(fields, parentFilter.collectionField) as RelationField
            const parentCollectionField = getField(fields, parentFilter.parentCollectionField) as RelationField
            const parentCollectionPermissions = permissions.collections?.[collectionField.collection]
            if (!parentCollectionPermissions) {
                granted = false
                return
            }
            if (
                !parentCollectionPermissions.parentEntities?.some((entity: string) =>
                    record[`${parentCollectionField.name}_Array`].includes(entity),
                )
            )
                parentParentFilterPassed = false
        })

    hasEntityParentFilters
        ?.filter((entityParentFilter) => entityParentFilter.parentFilter.type === "Parent_Property")
        .forEach((entityParentFilter) => {
            hasParentParentFilter = true
            const { parentFilter } = entityParentFilter as { parentFilter: ParentPropertyEntityParentFilter }
            const collectionField = getField(fields, parentFilter.collectionField) as RelationField
            const parentPropertyField = getField(fields, parentFilter.parentPropertyField)
            const parentCollectionField = getField(fields, parentFilter.parentCollectionField) as RelationField
            const parentCollectionPermissions = permissions.collections?.[collectionField.collection]
            if (!parentCollectionPermissions) {
                granted = false
                return
            }
            if (
                !Object.entries(parentCollectionPermissions.parentPropertyEntities || {}).some((property) => {
                    const [propertyKey, entities] = property
                    return (
                        propertyKey === record[parentPropertyField.name] &&
                        record[`${parentCollectionField.name}_Array`].some((entity: string) =>
                            entities.includes(entity),
                        )
                    )
                })
            )
                parentParentFilterPassed = false
        })

    if (hasIndividualParentFilter && hasParentParentFilter) {
        if (!(individualParentFilterPassed || parentParentFilterPassed)) {
            granted = false
            return
        }
    } else if (!individualParentFilterPassed || !parentParentFilterPassed) {
        granted = false
        return
    }

    return granted
}

export const documentAccess = (
    operation: "Read" | "Create" | "Update" | "Delete",
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    userId: string,
    permissions: StokerPermissions,
    record: StokerRecord,
) => {
    const { labels } = collectionSchema
    const collectionPermissions = permissions.collections?.[labels.collection]

    let granted = true

    if (!collectionPermissions || !permissions.Role) {
        granted = false
        return granted
    }

    if (!collectionAccess(operation, collectionPermissions)) granted = false

    const hasEntityRestrictions: EntityRestriction[] = getEntityRestrictions(collectionSchema, permissions)

    const hasIndividualEntityRestriction =
        hasEntityRestrictions?.filter((entityRestriction) => entityRestriction.type === "Individual").length > 0

    if (operation === "Create" && hasIndividualEntityRestriction) granted = false

    if (!filterAccess(operation, collectionSchema, schema, userId, permissions, record)) granted = false

    return granted
}

export const dependencyAccess = (
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    userId: string,
    permissions: StokerPermissions,
    record: StokerRecord,
) => {
    let granted = true

    if (!permissions.Role) {
        granted = false
        return granted
    }

    if (hasDependencyAccess(collectionSchema, schema, permissions).length === 0) granted = false

    if (!filterAccess("Read", collectionSchema, schema, userId, permissions, record, true)) granted = false

    return granted
}

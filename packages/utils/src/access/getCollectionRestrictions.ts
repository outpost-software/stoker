import {
    AttributeRestriction,
    CollectionPermissions,
    CollectionSchema,
    CollectionsSchema,
    EntityParentFilter,
    EntityRestriction,
    StokerPermissions,
} from "@stoker-platform/types"
import { getField } from "../schema/getField.js"
import { isRelationField } from "../schema/isRelationField.js"

export const getAttributeRestrictions = (
    collection: CollectionSchema,
    permissions: StokerPermissions,
): AttributeRestriction[] => {
    const restrictionKeys: { [key: string]: string } = {
        Record_Owner: "recordOwner",
        Record_User: "recordUser",
        Record_Property: "recordProperty",
    }
    const restrictions: AttributeRestriction[] = []
    const { labels, access } = collection
    const { attributeRestrictions } = access
    const collectionPermissions = permissions.collections?.[labels.collection]
    attributeRestrictions?.forEach((attributeRestriction) => {
        if ("roles" in attributeRestriction) {
            attributeRestriction.roles.forEach((role) => {
                const permissionRestriction = collectionPermissions?.[
                    restrictionKeys[attributeRestriction.type] as keyof CollectionPermissions
                ] as { active: boolean }
                if (role.role === permissions.Role && (!role.assignable || permissionRestriction?.active))
                    restrictions.push(attributeRestriction)
            })
        }
    })
    return restrictions
}

export const getEntityRestrictions = (
    collection: CollectionSchema,
    permissions: StokerPermissions,
): EntityRestriction[] => {
    const restrictions: EntityRestriction[] = []
    const { labels, access } = collection
    const { entityRestrictions } = access
    const collectionPermissions = permissions.collections?.[labels.collection]
    entityRestrictions?.restrictions?.forEach((entityRestriction) => {
        if ("roles" in entityRestriction) {
            entityRestriction.roles.forEach((role) => {
                if (
                    role.role === permissions.Role &&
                    (!entityRestrictions.assignable?.includes(permissions.Role) ||
                        collectionPermissions?.restrictEntities)
                )
                    restrictions.push(entityRestriction)
            })
        }
    })
    return restrictions
}

export const getEntityParentFilters = (
    collection: CollectionSchema,
    schema: CollectionsSchema,
    permissions: StokerPermissions,
): { parentFilter: EntityParentFilter; parentRestriction: EntityRestriction }[] => {
    const parentFilters: { parentFilter: EntityParentFilter; parentRestriction: EntityRestriction }[] = []
    const { access } = collection
    const { entityRestrictions } = access
    entityRestrictions?.parentFilters?.forEach((entityParentFilter) => {
        if (!entityParentFilter.roles.some((role) => role.role === permissions.Role)) return
        const collectionField = entityParentFilter.collectionField
        const collectionFieldSchema = getField(collection.fields, collectionField)
        if (!isRelationField(collectionFieldSchema)) throw new Error("PERMISSION_DENIED")
        // eslint-disable-next-line security/detect-object-injection
        const parentPermissions = permissions.collections?.[collectionFieldSchema.collection]
        const parentCollection = schema.collections[collectionFieldSchema.collection]
        const parentEntityRestrictions = parentCollection.access.entityRestrictions
        if (!parentEntityRestrictions) throw new Error("PERMISSION_DENIED")
        const parentRestriction = parentEntityRestrictions.restrictions?.find(
            (restriction) =>
                restriction.type === entityParentFilter.type &&
                restriction.roles.some((role) => role.role === permissions.Role),
        )
        if (!parentRestriction) throw new Error("PERMISSION_DENIED")
        parentRestriction.roles.forEach((role) => {
            if (
                role.role === permissions.Role &&
                (!parentEntityRestrictions.assignable?.includes(permissions.Role) ||
                    parentPermissions?.restrictEntities)
            ) {
                parentFilters.push({ parentFilter: entityParentFilter, parentRestriction })
            }
        })
    })
    return parentFilters
}

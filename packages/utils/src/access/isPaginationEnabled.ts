import { CollectionSchema, CollectionsSchema, StokerRole } from "@stoker-platform/types"
import { getField } from "../schema/getField.js"
import { isRelationField } from "../schema/isRelationField.js"

export const isPaginationEnabled = (
    role: StokerRole,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
) => {
    const { access } = collectionSchema
    const { entityRestrictions } = access
    if (entityRestrictions?.restrictions) {
        for (const restriction of entityRestrictions.restrictions) {
            if (restriction.roles?.some((accessRole) => accessRole.role === role)) {
                if (!("singleQuery" in restriction && restriction.singleQuery)) {
                    return `${restriction.type} entity restriction`
                }
            }
        }
    }
    if (entityRestrictions?.parentFilters) {
        for (const parentFilter of entityRestrictions.parentFilters) {
            if (!parentFilter.roles.some((accessRole) => accessRole.role === role)) continue
            const collectionFieldSchema = getField(collectionSchema.fields, parentFilter.collectionField)
            if (!isRelationField(collectionFieldSchema)) throw new Error("PERMISSION_DENIED")
            const parentCollection = schema.collections[collectionFieldSchema.collection]
            const parentRestriction = parentCollection.access.entityRestrictions?.restrictions?.find(
                (restriction) =>
                    restriction.type === parentFilter.type &&
                    restriction.roles.some((accessRole) => accessRole.role === role),
            )
            if (!parentRestriction) throw new Error("PERMISSION_DENIED")
            if (parentRestriction.type !== parentFilter.type) throw new Error("PERMISSION_DENIED")
            if (!("singleQuery" in parentRestriction && parentRestriction.singleQuery)) {
                return `${parentFilter.type} parent filter`
            }
        }
    }
    return true
}

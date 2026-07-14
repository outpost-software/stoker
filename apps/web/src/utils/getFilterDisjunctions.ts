import { Assignable, CollectionSchema, Filter, RelationList, StokerRecord } from "@stoker-platform/types"
import { getAttributeRestrictions } from "@stoker-platform/utils"
import { getCurrentUserPermissions } from "@stoker-platform/web-client"

export interface FilterDisjunctionsOptions {
    assignable?: Assignable
    isAssigning?: boolean
    filters?: Filter[]
    relationList?: RelationList
    relationParent?: StokerRecord
}

export const getFilterDisjunctions = (collection: CollectionSchema, options?: FilterDisjunctionsOptions) => {
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")
    let disjunctions = 0
    const incrementDisjunctions = (value: number | undefined) => {
        if (!value) return
        if (disjunctions === 0) {
            disjunctions = value
        } else {
            disjunctions *= value
        }
    }
    const hasAttributeRestrictions = getAttributeRestrictions(collection, permissions)
    if (hasAttributeRestrictions.length > 0) {
        for (const attributeRestriction of hasAttributeRestrictions) {
            if (attributeRestriction.type === "Record_Property") {
                const propertyRole = attributeRestriction.roles.find((roleItem) => roleItem.role === permissions.Role)
                if (!propertyRole) throw new Error("PERMISSION_DENIED")
                if (attributeRestriction.operations && !attributeRestriction.operations?.includes("Read")) continue
                incrementDisjunctions(propertyRole.values?.length)
            }
        }
    }
    if (
        options?.isAssigning &&
        options.relationList &&
        options.relationParent?.id &&
        options.assignable?.includeAssignedInFilters?.length &&
        options.filters
    ) {
        const activeOrCount = options.filters.filter(
            (filter) =>
                filter.type === "select" &&
                filter.value &&
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                options.assignable!.includeAssignedInFilters!.includes(filter.field),
        ).length
        for (let i = 0; i < activeOrCount; i++) {
            incrementDisjunctions(2)
        }
    }
    if (
        options?.isAssigning &&
        options.relationList &&
        options.relationParent?.id &&
        options.assignable?.includeValueInFilters?.length &&
        options.filters
    ) {
        const activeOrCount = options.filters.filter(
            (filter) =>
                filter.type === "select" &&
                filter.value &&
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                options.assignable!.includeValueInFilters!.some((item) => item.field === filter.field),
        ).length
        for (let i = 0; i < activeOrCount; i++) {
            incrementDisjunctions(2)
        }
    }
    return disjunctions
}

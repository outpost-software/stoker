import { CollectionSchema } from "@stoker-platform/types"
import { getField, isRelationField } from "@stoker-platform/utils"
import { serverReadOnly } from "./serverReadOnly"
import { preloadCacheEnabled } from "./preloadCacheEnabled"

export const getOrderBy = (
    collection: CollectionSchema,
    order: { field: string; direction: "asc" | "desc" } | undefined,
) => {
    const { fields, recordTitleField } = collection

    let orderByField = recordTitleField

    if (!order) {
        return { orderByField, orderByDirection: "asc" as const }
    }

    const isServerReadOnly = serverReadOnly(collection)
    const isPreloadCacheEnabled = preloadCacheEnabled(collection)
    const orderByFieldSchema = getField(fields, order?.field)
    if (isRelationField(orderByFieldSchema) && !(isPreloadCacheEnabled || isServerReadOnly)) {
        const titleField = orderByFieldSchema.titleField
        orderByField = `${orderByFieldSchema.name}_Single.${titleField}_Lowercase`
    } else if (order?.field) {
        if (orderByFieldSchema.type === "String") {
            orderByField = `${order.field}_Lowercase`
        } else {
            orderByField = order.field
        }
    }
    const orderByDirection = order?.direction || "asc"
    return { orderByField, orderByDirection }
}

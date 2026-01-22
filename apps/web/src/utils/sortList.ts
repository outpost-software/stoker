import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { getField, isRelationField } from "@stoker-platform/utils"
import { getSortingValue } from "./getSortingValue"
import { getCollectionConfigModule } from "@stoker-platform/web-client"

export const sortList = (
    collection: CollectionSchema,
    list: StokerRecord[],
    orderByField: string,
    orderByDirection: "asc" | "desc" | undefined,
    relationCollection?: CollectionSchema,
    relationParent?: StokerRecord,
) => {
    const customization = getCollectionConfigModule(collection.labels.collection)
    const { fields } = collection
    let orderByFieldName = orderByField
    if (orderByField.endsWith("_Lowercase") && !orderByField.includes("_Single.")) {
        orderByFieldName = orderByField.slice(0, -10)
    }
    if (orderByField.includes("_Single.")) {
        orderByFieldName = orderByField.split("_Single.")[0]
    }
    const orderByFieldSchema = getField(fields, orderByFieldName)
    if (!isRelationField(orderByFieldSchema)) {
        const sortedList = [...list].sort((a, b) => {
            const valueA = getSortingValue(
                collection,
                customization,
                orderByFieldName,
                a,
                relationCollection,
                relationParent,
            )
            const valueB = getSortingValue(
                collection,
                customization,
                orderByFieldName,
                b,
                relationCollection,
                relationParent,
            )
            const fieldA =
                orderByFieldSchema.type === "String"
                    ? // eslint-disable-next-line security/detect-object-injection
                      valueA?.toString().toLowerCase()
                    : // eslint-disable-next-line security/detect-object-injection
                      valueA
            const fieldB =
                orderByFieldSchema.type === "String"
                    ? // eslint-disable-next-line security/detect-object-injection
                      valueB?.toString().toLowerCase()
                    : // eslint-disable-next-line security/detect-object-injection
                      valueB
            if (fieldA < fieldB) return orderByDirection === "asc" ? -1 : 1
            if (fieldA > fieldB) return orderByDirection === "asc" ? 1 : -1
            return 0
        })
        return sortedList
    } else {
        const titleField = orderByFieldSchema.titleField
        const getValue = (record: StokerRecord) => {
            if (!record[orderByFieldName as keyof StokerRecord]) return
            if (titleField) {
                // eslint-disable-next-line security/detect-object-injection
                const relation = Object.values(record[orderByFieldName as keyof StokerRecord])[0] as Record<
                    string,
                    unknown
                >
                // eslint-disable-next-line security/detect-object-injection
                if (relation?.[titleField]) {
                    // eslint-disable-next-line security/detect-object-injection
                    return (relation[titleField] as string).toLowerCase()
                }
            }
            return Object.keys(record[orderByField as keyof StokerRecord])[0] as string
        }
        const sortedList = [...list].sort((a, b) => {
            const aValue = getValue(a)
            const bValue = getValue(b)

            if (!aValue && !bValue) {
                return 0
            }
            if (!aValue) {
                return 1
            }
            if (!bValue) {
                return -1
            }

            if (orderByDirection === "asc") {
                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
            } else {
                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
            }
        })
        return sortedList
    }
}

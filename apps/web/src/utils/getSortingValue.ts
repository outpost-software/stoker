import { getField, getFieldCustomization, tryFunction } from "@stoker-platform/utils"
import { CollectionCustomization, CollectionSchema, StokerRecord } from "@stoker-platform/types"

export const getSortingValue = (
    collection: CollectionSchema,
    customization: CollectionCustomization,
    field: string,
    record: StokerRecord,
    parentCollection?: CollectionSchema,
    parentRecord?: StokerRecord,
) => {
    const { fields } = collection
    const fieldSchema = getField(fields, field)
    const fieldCustomization = getFieldCustomization(fieldSchema, customization)
    // eslint-disable-next-line security/detect-object-injection
    return tryFunction(fieldCustomization.admin?.sort, [record, parentCollection, parentRecord]) || record[field]
}

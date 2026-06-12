import { getField, getFieldCustomization, getSystemFieldsSchema, tryFunction } from "@stoker-platform/utils"
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
    const systemFields = getSystemFieldsSchema()
    if (systemFields.some((systemField) => systemField.name === field)) {
        // eslint-disable-next-line security/detect-object-injection
        return record[field]
    }
    const fieldSchema = getField(fields, field)
    const fieldCustomization = getFieldCustomization(fieldSchema, customization)
    // eslint-disable-next-line security/detect-object-injection
    return tryFunction(fieldCustomization.admin?.sort, [record, parentCollection, parentRecord]) || record[field]
}

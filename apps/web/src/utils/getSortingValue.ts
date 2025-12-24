import { getField, getFieldCustomization, tryFunction } from "@stoker-platform/utils"
import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { getCollectionConfigModule } from "@stoker-platform/web-client"

export const getSortingValue = (
    collection: CollectionSchema,
    field: string,
    record: StokerRecord,
    parentCollection?: CollectionSchema,
    parentRecord?: StokerRecord,
) => {
    const { fields } = collection
    const customization = getCollectionConfigModule(collection.labels.collection)
    const fieldSchema = getField(fields, field)
    const fieldCustomization = getFieldCustomization(fieldSchema, customization)
    // eslint-disable-next-line security/detect-object-injection
    return tryFunction(fieldCustomization.admin?.sort, [record, parentCollection, parentRecord]) || record[field]
}

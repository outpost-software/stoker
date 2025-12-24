import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { getField } from "../schema/getField.js"
import cloneDeep from "lodash/cloneDeep.js"

export const removePrivateFields = (record: StokerRecord, schema: CollectionSchema): StokerRecord => {
    const { fields } = schema
    const privateFieldsRemoved = cloneDeep(record)
    Object.keys(record).filter((key) => {
        const field = getField(fields, key)
        if (field?.access) {
            // eslint-disable-next-line security/detect-object-injection
            delete privateFieldsRemoved[key]
        }
    })
    return privateFieldsRemoved
}

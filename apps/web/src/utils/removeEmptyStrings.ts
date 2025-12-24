import { CollectionSchema, StokerRecord, UserData } from "@stoker-platform/types"
import { getField } from "@stoker-platform/utils"

type Record = Partial<StokerRecord> | UserData

export const removeEmptyStrings = (collection: CollectionSchema, record: Record | undefined) => {
    if (!record) return
    const { fields } = collection

    const deleteEmptyStrings = (record: Record) => {
        Object.entries(record).forEach(([key, value]) => {
            const field = getField(fields, key)
            if (value === "" || (value === null && !field?.nullable) || value === undefined) {
                delete record[key as keyof Record]
            } else if (typeof value === "object" && value !== null) {
                deleteEmptyStrings(value)
            }
        })
    }
    deleteEmptyStrings(record)
}

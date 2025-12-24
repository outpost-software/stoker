import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { FieldValue } from "firebase-admin/firestore"

export const validateSoftDelete = (
    operation: "create" | "update",
    collection: CollectionSchema,
    record: StokerRecord,
    originalRecord?: StokerRecord,
) => {
    const { softDelete } = collection
    if (!softDelete) return
    const softDeleteField = softDelete?.archivedField
    const softDeleteTimestampField = softDelete?.timestampField
    /* eslint-disable security/detect-object-injection */
    if (record[softDeleteField] === true) {
        if (operation === "create") {
            record[softDeleteTimestampField] = FieldValue.serverTimestamp()
        } else {
            if (!originalRecord) {
                throw new Error("Original record is required for update")
            }
            if (!originalRecord[softDeleteField]) {
                record[softDeleteTimestampField] = FieldValue.serverTimestamp()
            } else if (
                record[softDeleteTimestampField] &&
                record[softDeleteTimestampField]?.valueOf() !== originalRecord[softDeleteTimestampField]?.valueOf()
            ) {
                throw new Error("Soft delete timestamp cannot be changed")
            }
        }
    }
    /* eslint-enable security/detect-object-injection */
}

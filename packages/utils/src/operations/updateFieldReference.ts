import { StokerRecord } from "@stoker-platform/types"

export const updateFieldReference = (update: StokerRecord, fieldReference: Set<string>) => {
    const updateKeys = Object.keys(update as StokerRecord)
    fieldReference.forEach((key) => {
        if (!(key in updateKeys)) {
            fieldReference.delete(key)
        }
    })
    updateKeys.forEach((key) => {
        fieldReference.add(key)
    })
    if (!fieldReference.has("id")) {
        fieldReference.add("id")
    }
}

import { StokerRecord } from "@stoker-platform/types"

export const removeDeletedFields = (document: StokerRecord, fieldReferences: Map<unknown, Set<string>>) => {
    Object.keys(document).forEach((key) => {
        let hasReference = false
        fieldReferences.forEach((fieldReference) => {
            if (fieldReference.has(key)) {
                hasReference = true
            }
        })
        if (!hasReference) {
            // eslint-disable-next-line security/detect-object-injection
            delete document[key]
        }
    })
}

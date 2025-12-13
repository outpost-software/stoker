import { StokerRecord } from "@stoker-platform/types"

/* eslint-disable security/detect-object-injection */

export const removeUndefined = (record: StokerRecord | Partial<StokerRecord>) => {
    for (const key in record) {
        if (!Object.prototype.hasOwnProperty.call(record, key)) {
            continue
        }
        if (record[key] === undefined) {
            delete record[key]
        } else if (typeof record[key] === "object" && record[key] !== null) {
            removeUndefined(record[key])
        }
    }
}

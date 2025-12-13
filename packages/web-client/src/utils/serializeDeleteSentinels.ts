import { StokerRecord } from "@stoker-platform/types"
import { isDeleteSentinel } from "@stoker-platform/utils"

/* eslint-disable security/detect-object-injection */

export const serializeDeleteSentinels = (record: Partial<StokerRecord>) => {
    if (typeof record === "object") {
        for (const key in record) {
            if (!Object.prototype.hasOwnProperty.call(record, key)) {
                continue
            }
            if (isDeleteSentinel(record[key])) {
                record[key] = "_DELETE_FIELD"
            } else {
                serializeDeleteSentinels(record[key])
            }
        }
    }
}

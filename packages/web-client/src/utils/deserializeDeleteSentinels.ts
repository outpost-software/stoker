import { StokerRecord } from "@stoker-platform/types"
import { deleteField } from "firebase/firestore"

/* eslint-disable security/detect-object-injection */

export const deserializeDeleteSentinels = (record: Partial<StokerRecord>) => {
    if (typeof record === "object") {
        for (const key in record) {
            if (!Object.prototype.hasOwnProperty.call(record, key)) {
                continue
            }
            if (record[key] === "_DELETE_FIELD") {
                record[key] = deleteField()
            } else {
                deserializeDeleteSentinels(record[key])
            }
        }
    }
}

import { StokerRecord } from "@stoker-platform/types"
import { FieldValue } from "firebase-admin/firestore"

/* eslint-disable security/detect-object-injection */

export const deserializeDeleteSentinels = (record: Partial<StokerRecord>) => {
    if (typeof record === "object") {
        for (const key in record) {
            if (!Object.prototype.hasOwnProperty.call(record, key)) {
                continue
            }
            if (record[key] === "_DELETE_FIELD") {
                record[key] = FieldValue.delete()
            } else {
                deserializeDeleteSentinels(record[key])
            }
        }
    }
}

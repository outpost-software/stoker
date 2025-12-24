import { StokerRecord } from "@stoker-platform/types"
import { isDeleteSentinel } from "./isDeleteSentinel.js"

/* eslint-disable security/detect-object-injection */

export const removeDeleteSentinels = (obj: StokerRecord) => {
    for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) {
            continue
        }
        if (isDeleteSentinel(obj[key])) {
            delete obj[key]
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
            removeDeleteSentinels(obj[key])
        }
    }
}

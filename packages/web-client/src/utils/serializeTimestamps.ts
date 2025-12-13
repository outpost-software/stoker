import { StokerRecord } from "@stoker-platform/types"
import { Timestamp } from "firebase/firestore"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isObject = (value: any): value is Record<string, any> => {
    return value !== null && typeof value === "object"
}

export const serializeTimestamps = (record: Partial<StokerRecord>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serialize = (object: any) => {
        Object.entries(object).forEach(([key, value]) => {
            if (value instanceof Timestamp) {
                // eslint-disable-next-line security/detect-object-injection
                object[key] = {
                    _seconds: value.seconds,
                    _nanoseconds: value.nanoseconds,
                }
            } else if (isObject(value)) {
                serialize(value)
            }
        })
    }
    serialize(record)
}

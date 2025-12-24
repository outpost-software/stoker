import { StokerRecord } from "@stoker-platform/types"
import { Timestamp } from "firebase-admin/firestore"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isObject = (value: any): value is Record<string, any> => {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

export const deserializeTimestampsWithoutUnderscores = (record: Partial<StokerRecord>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deserialize = (object: any) => {
        Object.entries(object).forEach(([key, value]) => {
            if (
                isObject(value) &&
                Object.keys(value).length === 2 &&
                typeof value.seconds === "number" &&
                typeof value.nanoseconds === "number"
            ) {
                // eslint-disable-next-line security/detect-object-injection
                object[key] = new Timestamp(value.seconds, value.nanoseconds)
            } else if (isObject(value)) {
                deserialize(value)
            }
        })
    }
    deserialize(record)
}

export const deserializeTimestamps = (record: Partial<StokerRecord>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deserialize = (object: any) => {
        Object.entries(object).forEach(([key, value]) => {
            if (
                isObject(value) &&
                Object.keys(value).length === 2 &&
                typeof value._seconds === "number" &&
                typeof value._nanoseconds === "number"
            ) {
                // eslint-disable-next-line security/detect-object-injection
                object[key] = new Timestamp(value._seconds, value._nanoseconds)
            } else if (isObject(value)) {
                deserialize(value)
            }
        })
    }
    deserialize(record)
}

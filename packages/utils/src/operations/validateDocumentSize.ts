import { StokerRecord } from "@stoker-platform/types"

/* eslint-disable @typescript-eslint/no-explicit-any */

const FIRESTORE_MAX_DOCUMENT_SIZE = 1_048_576

const textEncoder = new TextEncoder()

// Strings are encoded as UTF-8 plus a single terminating byte
const getStringSize = (value: string) => textEncoder.encode(value).length + 1

// Document names are the sum of the sizes of their path segments plus 16 bytes
const getDocumentNameSize = (segments: string[]) => {
    return segments.reduce((total, segment) => total + getStringSize(segment), 0) + 16
}

const isTimestampLike = (value: any) => {
    return typeof value.seconds === "number" && typeof value.nanoseconds === "number"
}

const isGeoPointLike = (value: any) => {
    return typeof value.latitude === "number" && typeof value.longitude === "number"
}

const isDocumentReferenceLike = (value: any) => {
    return typeof value.path === "string" && value.firestore !== undefined
}

const isBytesLike = (value: any) => {
    return (
        value instanceof Uint8Array ||
        value instanceof ArrayBuffer ||
        typeof value.toUint8Array === "function" ||
        typeof value.toBase64 === "function"
    )
}

const getSentinelSize = (value: any): number | undefined => {
    const methodName: unknown = value._methodName ?? value.methodName
    const constructorName: string | undefined = value.constructor?.name
    const name = typeof methodName === "string" ? methodName : constructorName
    if (!name) return undefined
    const isSentinel =
        typeof methodName === "string" ||
        (typeof constructorName === "string" &&
            (constructorName.endsWith("Transform") || constructorName.endsWith("FieldValueImpl")))
    if (!isSentinel) return undefined
    if (name.includes("delete") || name.includes("Delete")) return 0
    if (name.includes("arrayUnion") || name.includes("ArrayUnion")) {
        const elements = value._elements ?? value.elements
        return Array.isArray(elements) ? getValueSize(elements) : 0
    }
    if (name.includes("arrayRemove") || name.includes("ArrayRemove")) return 0
    // serverTimestamp, increment, vector
    return 8
}

const getValueSize = (value: any): number => {
    if (value === null || value === undefined) return 1
    switch (typeof value) {
        case "string":
            return getStringSize(value)
        case "number":
        case "bigint":
            return 8
        case "boolean":
            return 1
        case "function":
        case "symbol":
            return 0
    }
    if (Array.isArray(value)) {
        return value.reduce((total: number, item) => total + getValueSize(item), 0)
    }
    if (value instanceof Date) return 8
    if (isBytesLike(value)) {
        if (value instanceof Uint8Array || value instanceof ArrayBuffer) return value.byteLength
        if (typeof value.toUint8Array === "function") return value.toUint8Array().byteLength
        return 0
    }
    const sentinelSize = getSentinelSize(value)
    if (sentinelSize !== undefined) return sentinelSize
    if (isTimestampLike(value)) return 8
    if (isGeoPointLike(value)) return 16
    if (isDocumentReferenceLike(value)) return getDocumentNameSize(value.path.split("/"))
    // Vector
    if (Array.isArray(value.toArray?.())) return getValueSize(value.toArray())
    // Map
    let total = 0
    for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue
        // eslint-disable-next-line security/detect-object-injection
        const fieldValue = value[key]
        if (fieldValue === undefined) continue
        total += getStringSize(key) + getValueSize(fieldValue)
    }
    return total
}

export const getDocumentSize = (record: StokerRecord, documentPath?: string[]) => {
    const nameSize = documentPath ? getDocumentNameSize(documentPath) : 0
    return nameSize + getValueSize(record) + 32
}

export const validateDocumentSize = (record: StokerRecord, documentPath?: string[]) => {
    const size = getDocumentSize(record, documentPath)
    if (size > FIRESTORE_MAX_DOCUMENT_SIZE) {
        throw new Error(`VALIDATION_ERROR: This record exceeds the size limit of 1MB`)
    }
    return size
}

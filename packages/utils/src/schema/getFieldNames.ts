import type { CollectionField } from "@stoker-platform/types"

export const getFieldNames = (fields: CollectionField[]) => {
    return JSON.stringify(fields.map((field) => field.name))
}

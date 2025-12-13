import type { CollectionField } from "@stoker-platform/types"

export const getField = (fields: CollectionField[], fieldName: string | undefined) => {
    return fields.filter((field) => field.name === fieldName)[0]
}

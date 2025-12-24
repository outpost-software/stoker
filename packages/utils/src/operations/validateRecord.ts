import { getZodSchema } from "./getZodSchema.js"
import {
    CollectionCustomization,
    StokerRecord,
    PreValidateHook,
    PreValidateHookArgs,
    CollectionSchema,
    CollectionsSchema,
} from "@stoker-platform/types"
import { tryPromise } from "../getConfigValue.js"

const preValidate = async (callback?: PreValidateHook, args?: PreValidateHookArgs) => {
    if (callback) {
        const validation = await tryPromise(callback, args)
        if (!validation.valid) throw new Error(`VALIDATION_ERROR: ${validation.message}`)
    }
}

export const validateRecord = async (
    operation: "create" | "update",
    record: StokerRecord,
    collection: CollectionSchema,
    customization: CollectionCustomization,
    args: PreValidateHookArgs,
    schema: CollectionsSchema,
) => {
    await preValidate(customization.custom?.preValidate, args)
    for (const field of customization.fields) {
        await preValidate(field.custom?.preValidate, args)
    }

    const zodSchema = getZodSchema(operation, collection, schema)
    zodSchema.parse(record)

    return record
}

import { CollectionField, CollectionSchema, CollectionsSchema, RelationField } from "@stoker-platform/types"
import { z } from "zod"
import { isRelationField } from "../schema/isRelationField.js"
import { getSingleFieldRelations } from "./getSingleFieldRelations.js"
import { getLowercaseFields } from "./getLowercaseFields.js"

const isTimestamp = () => {
    return z.any().refine(
        (data) => {
            return (
                data &&
                ((data.seconds !== undefined && data.nanoseconds !== undefined) ||
                    (data._seconds !== undefined && data._nanoseconds !== undefined))
            )
        },
        {
            message: "Value is not a valid timestamp",
        },
    )
}
const isServerTimestamp = () => {
    return z
        .any()
        .refine(
            (data) =>
                data &&
                (data._methodName === "serverTimestamp" || data.constructor.name === "ServerTimestampTransform"),
            {
                message: "Value is not a valid server timestamp",
            },
        )
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
const isRelationSingle = (field: RelationField, schema: CollectionsSchema) => {
    const includeFields: any = {}
    if (field.includeFields) {
        const relationCollection = schema.collections[field.collection]
        if (!relationCollection) return z.record(z.any())
        field.includeFields.forEach((includeField) => {
            const relationField = relationCollection.fields.find((field) => field.name === includeField)
            if (!relationField) {
                throw new Error(`Field ${includeField} not found in collection ${field.collection}`)
            }
            // eslint-disable-next-line security/detect-object-injection
            includeFields[includeField] = getFieldSchema(relationCollection, relationField)
            const lowercaseFields = getLowercaseFields(relationCollection, [relationField])
            if (lowercaseFields.size === 1) {
                includeFields[`${includeField}_Lowercase`] = getFieldSchema(relationCollection, relationField, true)
            }
        })
    }
    return z.object({
        Collection_Path: z.array(z.string()),
        ...includeFields,
    })
}

const isRelationObject = (field: RelationField, schema: CollectionsSchema) => {
    let fieldSchema: any = z.record(isRelationSingle(field, schema))
    if (!field.required) {
        fieldSchema = fieldSchema.optional()
    }
    return fieldSchema
}

const isRelationArray = (field: RelationField) => {
    let fieldSchema: any = z.array(z.union([z.string().length(20), z.string().length(28)]))
    if (["OneToOne", "OneToMany"].includes(field.type)) {
        fieldSchema = fieldSchema.max(1)
    } else {
        if (field.min) {
            fieldSchema = fieldSchema.min(field.min)
        }
        if (field.max) {
            fieldSchema = fieldSchema.max(field.max)
        }
        if (field.length) {
            fieldSchema = fieldSchema.length(field.length)
        }
    }
    if (!field.required) {
        fieldSchema = fieldSchema.optional()
    } else {
        fieldSchema = fieldSchema.nonempty()
    }
    return fieldSchema
}

const getFieldSchema = (collection: CollectionSchema, field: CollectionField, lowercase?: boolean) => {
    const { softDelete } = collection
    const softDeleteTimestampField = softDelete?.timestampField
    let fieldSchema
    switch (field.type) {
        case "String":
            fieldSchema = z.string()
            if (field.length) {
                fieldSchema = fieldSchema.length(field.length)
            }
            if (field.minlength) {
                fieldSchema = fieldSchema.min(field.minlength)
            }
            if (field.maxlength) {
                fieldSchema = fieldSchema.max(field.maxlength)
            }
            if (field.email) {
                fieldSchema = fieldSchema.email()
            }
            if (field.uuid) {
                fieldSchema = fieldSchema.uuid()
            }
            if (field.url) {
                fieldSchema = fieldSchema.url()
            }
            if (field.emoji) {
                fieldSchema = fieldSchema.emoji()
            }
            if (field.ip) {
                fieldSchema = fieldSchema.ip()
            }
            if (field.pattern) {
                // eslint-disable-next-line security/detect-non-literal-regexp
                fieldSchema = fieldSchema.regex(new RegExp(field.pattern))
            }
            if (lowercase) {
                fieldSchema = fieldSchema.toLowerCase()
            }
            if (field.values) {
                if (lowercase) {
                    const lowercaseValues = field.values.map((value) => value.toLowerCase())
                    fieldSchema = z.enum(lowercaseValues as [string, ...string[]])
                } else {
                    fieldSchema = z.enum(field.values as [string, ...string[]])
                }
            }
            break
        case "Boolean":
            fieldSchema = z.boolean()
            break
        case "Number":
            if (field.autoIncrement) {
                fieldSchema = z.union([z.literal("Pending"), z.number().int()])
            } else {
                fieldSchema = z.number()
                if (field.min) {
                    fieldSchema = fieldSchema.min(field.min)
                }
                if (field.max) {
                    fieldSchema = fieldSchema.max(field.max)
                }
                if (!field.decimal) {
                    fieldSchema = fieldSchema.int()
                } else {
                    fieldSchema = fieldSchema.refine(
                        (data: number) => {
                            if (!field.decimal) return false
                            const decimalPlaces = data.toString().split(".")[1]?.length || 0
                            return decimalPlaces <= field.decimal
                        },
                        {
                            message: `Value must have ${field.decimal} or fewer decimal places`,
                        },
                    )
                }
                if (field.values) {
                    fieldSchema = fieldSchema.refine((data: number) => field.values?.includes(data), {
                        message: "Value is not an allowed value",
                    })
                }
            }
            break
        case "Timestamp":
            if (field.name === softDeleteTimestampField) {
                fieldSchema = z
                    .any()
                    .refine(
                        (data) =>
                            data &&
                            (data._methodName === "serverTimestamp" ||
                                data.constructor.name === "ServerTimestampTransform" ||
                                (data.seconds !== undefined && data.nanoseconds !== undefined) ||
                                (data._seconds !== undefined && data._nanoseconds !== undefined)),
                        {
                            message: "Value is not a valid timestamp",
                        },
                    )
            } else {
                fieldSchema = isTimestamp()
                if (field.min) {
                    fieldSchema = fieldSchema.refine((data: any) => data.toMillis() >= field.min!, {
                        message: `Value is less than the minimum allowed value of ${field.min}`,
                    })
                }
                if (field.max) {
                    fieldSchema = fieldSchema.refine((data: any) => data.toMillis() <= field.max!, {
                        message: `Value is greater than the maximum allowed value of ${field.max}`,
                    })
                }
            }
            break
        case "Array":
            fieldSchema = z.array(z.any())
            if (field.length) {
                fieldSchema = fieldSchema.length(field.length)
            }
            if (field.minlength) {
                fieldSchema = fieldSchema.min(field.minlength)
            } else if (field.required) {
                fieldSchema = fieldSchema.nonempty()
            }
            if (field.maxlength) {
                fieldSchema = fieldSchema.max(field.maxlength)
            }
            if (field.values) {
                fieldSchema = fieldSchema.refine(
                    (data: string[]) => {
                        let valid = true
                        data.forEach((value) => {
                            if (field.values && !field.values.includes(value)) {
                                valid = false
                            }
                        })
                        return valid
                    },
                    { message: "Value is not an allowed value" },
                )
            }
            break
        case "Map":
            fieldSchema = z.record(z.any())
            if (field.required) {
                fieldSchema = fieldSchema.refine(
                    (data: any) => data && typeof data === "object" && Object.keys(data).length > 0,
                    {
                        message: "Value must have at least one object property",
                    },
                )
            }
            break
        case "Embedding":
            fieldSchema = z.any()
            break
    }
    if (!isRelationField(field) && field.nullable) {
        fieldSchema = fieldSchema!.nullable()
    }
    if (!field.required) {
        fieldSchema = fieldSchema!.optional()
    }
    return fieldSchema
}

export const getZodSchema = (
    operation: "create" | "update",
    collection: CollectionSchema,
    schema: CollectionsSchema,
) => {
    const fields: { [key: string]: any } = {
        Collection_Path: z.array(z.string()),
        Last_Write_App: z.string(),
        Last_Write_At: isTimestamp(),
        Last_Save_At: isServerTimestamp(),
        Last_Write_By: z.union([z.string().length(28), z.literal("System")]),
        Last_Write_Connection_Status: z.enum(["Online", "Offline"]),
        Last_Write_Version: z.number().int(),
        id: z.string().regex(new RegExp("^[a-zA-Z0-9]+$")).length(20),
        Created_At: isTimestamp(),
        Created_By: z.union([z.string().length(28), z.literal("System")]),
    }
    if (operation === "create") {
        fields.Saved_At = isServerTimestamp()
    }
    if (operation === "update") {
        fields.Saved_At = isTimestamp()
        fields.Collection_Path = fields.Collection_Path.optional()
        fields.id = fields.id.optional()
        fields.Created_At = fields.Created_At.optional()
        fields.Saved_At = fields.Saved_At.optional()
        fields.Created_By = fields.Created_By.optional()
    }

    const singleFieldRelations = getSingleFieldRelations(collection, collection.fields)
    const singleFieldRelationsNames = Array.from(singleFieldRelations).map((field) => field.name)

    collection.fields.forEach((field: CollectionField) => {
        if (isRelationField(field)) {
            fields[field.name] = isRelationObject(field, schema)
            fields[`${field.name}_Array`] = isRelationArray(field)
            if (singleFieldRelationsNames.includes(field.name)) {
                fields[`${field.name}_Single`] = isRelationSingle(field, schema)
                if (!field.required) {
                    fields[`${field.name}_Single`] = fields[`${field.name}_Single`].optional()
                }
            }
            if (field.length) {
                fields[field.name] = fields[field.name].refine(
                    (data: any) => field.length && data && Object.keys(data).length === field.length,
                    {
                        message: `Value must contain ${field.length} item(s)`,
                    },
                )
            }
            if (field.min) {
                fields[field.name] = fields[field.name].refine(
                    (data: any) => field.min && data && Object.keys(data).length >= field.min,
                    {
                        message: `Value must contain at least ${field.min} item(s)`,
                    },
                )
            }
            if (field.max) {
                fields[field.name] = fields[field.name].refine(
                    (data: any) => field.max && (!data || Object.keys(data).length <= field.max),
                    {
                        message: `Value must contain at most ${field.max} item(s)`,
                    },
                )
            }
        } else if (field.type !== "Computed") {
            fields[field.name] = getFieldSchema(collection, field)
        }
    })

    const lowercaseFields = getLowercaseFields(collection, collection.fields)
    lowercaseFields.forEach((field) => {
        if (fields[field.name]) {
            fields[`${field.name}_Lowercase`] = getFieldSchema(collection, field, true)
        }
    })

    const record = z.object(fields)

    if (collection.allowSchemalessFields) {
        return record.passthrough()
    } else {
        return record.strict()
    }
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

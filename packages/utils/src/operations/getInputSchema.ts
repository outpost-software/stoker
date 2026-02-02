import {
    CollectionCustomization,
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    RelationField,
} from "@stoker-platform/types"
import { z } from "zod"
import { isRelationField } from "../schema/isRelationField.js"
import { tryFunction } from "../getConfigValue.js"
import { getField } from "../schema/getField.js"
import { DateTime } from "luxon"
import { getFieldCustomization } from "../getFieldCustomization.js"

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
const isRelationSingle = (field: RelationField, schema: CollectionsSchema) => {
    const includeFields: any = {}
    if (field.includeFields) {
        const relationCollection = schema.collections[field.collection]
        if (!relationCollection) return z.record(z.any())
        field.includeFields.forEach((includeField) => {
            const relationField = relationCollection.fields.find((field) => field.name === includeField)
            if (!relationField) {
                // eslint-disable-next-line security/detect-object-injection
                includeFields[includeField] = z.any()
            } else {
                // eslint-disable-next-line security/detect-object-injection
                includeFields[includeField] = getFieldSchema(relationField)?.nullable()
            }
        })
    }
    return z.object({
        Collection_Path: z.array(z.string()),
        ...includeFields,
    })
}

const isRelationObject = (
    field: RelationField,
    schema: CollectionsSchema,
    customization?: CollectionCustomization,
    chat?: boolean,
) => {
    let fieldSchema: any = z.object({}).catchall(isRelationSingle(field, schema))
    let skipFormRequiredValidation: boolean | undefined
    if (!chat && customization) {
        const fieldCustomization = getFieldCustomization(field, customization)
        skipFormRequiredValidation = tryFunction(fieldCustomization.admin?.skipFormRequiredValidation)
    }
    if (!field.required || skipFormRequiredValidation) {
        fieldSchema = fieldSchema.optional()
    }
    return fieldSchema
}

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
            message: "Must be a valid date",
        },
    )
}

const getFieldSchema = (field: CollectionField, customization?: CollectionCustomization, chat?: boolean) => {
    let fieldSchema
    const fieldDescription = `${tryFunction(field.description)}\n\n` || ""
    let hidden: boolean | undefined
    let skipFormRequiredValidation: boolean | undefined
    let image: boolean | undefined
    if (!chat && customization) {
        const fieldCustomization = getFieldCustomization(field, customization)
        hidden =
            fieldCustomization.admin?.condition?.form !== undefined &&
            !tryFunction(fieldCustomization.admin.condition.form)
        skipFormRequiredValidation = tryFunction(fieldCustomization.admin?.skipFormRequiredValidation)
        image = tryFunction(fieldCustomization.admin?.image)
    }

    switch (field.type) {
        case "String":
            fieldSchema = z.string()
            if (field.length) {
                fieldSchema = fieldSchema.length(field.length, `Must be ${field.length} character(s) long`)
            }
            if (field.minlength) {
                fieldSchema = fieldSchema.min(field.minlength, `Must contain at least ${field.minlength} character(s)`)
            }
            if (field.maxlength) {
                fieldSchema = fieldSchema.max(field.maxlength, `Must contain at most ${field.maxlength} character(s)`)
            }
            if (field.email) {
                fieldSchema = fieldSchema.email("Must be a valid email address")
            } else if (field.uuid) {
                fieldSchema = z.union([fieldSchema.uuid("Must be a valid UUID"), z.literal("")])
            } else if (field.url) {
                fieldSchema = z.union([fieldSchema.url("Must be a valid URL"), z.literal("")])
            } else if (field.emoji) {
                fieldSchema = z.union([fieldSchema.emoji("Must be a valid emoji"), z.literal("")])
            } else if (field.ip) {
                fieldSchema = z.union([fieldSchema.ip("Must be a valid IP address"), z.literal("")])
            } else if (field.pattern) {
                if (!chat && image) {
                    // eslint-disable-next-line security/detect-non-literal-regexp
                    fieldSchema = z.union([fieldSchema.regex(new RegExp(field.pattern)), fieldSchema.regex(/^blob:/)], {
                        message: "Must be a valid value",
                    })
                } else {
                    // eslint-disable-next-line security/detect-non-literal-regexp
                    fieldSchema = fieldSchema.regex(new RegExp(field.pattern), "Must be a valid value")
                }
            }
            if (field.values) {
                fieldSchema = z.union([
                    z.enum(field.values as [string, ...string[]], {
                        message: `Must be one of the following values: ${field.values.join(", ")}`,
                    }),
                    z.undefined(),
                ])
            }
            if (fieldDescription) {
                fieldSchema = fieldSchema.describe(fieldDescription.trim())
            }
            break
        case "Boolean":
            fieldSchema = z.boolean()
            if (fieldDescription) {
                fieldSchema = fieldSchema.describe(fieldDescription.trim())
            }
            break
        case "Number":
            if (field.autoIncrement) {
                fieldSchema = z.union([z.undefined(), z.number().int()], {
                    message: "Must be a valid number",
                })
            } else {
                fieldSchema = z.number({
                    message: "Must be a valid number",
                })
                if (field.min) {
                    fieldSchema = fieldSchema.min(field.min, `Must be greater than or equal to ${field.min}`)
                }
                if (field.max) {
                    fieldSchema = fieldSchema.max(field.max, `Must be less than or equal to ${field.max}`)
                }
                if (!field.decimal) {
                    fieldSchema = fieldSchema.int("Must not have decimal places")
                } else {
                    if (!chat) {
                        fieldSchema = fieldSchema.refine(
                            (data: number) => {
                                if (!field.decimal) return false
                                const decimalPlaces = data.toString().split(".")[1]?.length || 0
                                return decimalPlaces <= field.decimal
                            },
                            {
                                message: `Must have ${field.decimal} or fewer decimal places`,
                            },
                        )
                    } else {
                        fieldSchema = fieldSchema.describe(
                            `${fieldDescription}Must have ${field.decimal} decimal places`,
                        )
                    }
                }
                if (field.values) {
                    if (!chat) {
                        fieldSchema = z.union([
                            fieldSchema.refine((data: number) => field.values?.includes(data), {
                                message: `Must be one of the following values: ${field.values.join(", ")}`,
                            }),
                            z.undefined(),
                        ])
                    }
                    fieldSchema = fieldSchema.describe(
                        `${fieldDescription}Must be one of the following values: ${field.values.join(", ")}`,
                    )
                } else if (fieldDescription) {
                    fieldSchema = fieldSchema.describe(fieldDescription.trim())
                }
            }
            break
        case "Timestamp":
            if (chat) {
                fieldSchema = z.object({
                    seconds: z.number(),
                    nanoseconds: z.number(),
                })
                if (field.min && field.max) {
                    fieldSchema = fieldSchema.describe(
                        `${fieldDescription}Must be between ${DateTime.fromMillis(field.min).toLocaleString(DateTime.DATE_MED)} and ${DateTime.fromMillis(field.max).toLocaleString(DateTime.DATE_MED)}`,
                    )
                } else if (field.min) {
                    fieldSchema = fieldSchema.describe(
                        `${fieldDescription}Must be greater than or equal to ${DateTime.fromMillis(field.min).toLocaleString(DateTime.DATE_MED)}`,
                    )
                } else if (field.max) {
                    fieldSchema = fieldSchema.describe(
                        `${fieldDescription}Must be less than or equal to ${DateTime.fromMillis(field.max).toLocaleString(DateTime.DATE_MED)}`,
                    )
                } else if (fieldDescription) {
                    fieldSchema = fieldSchema.describe(fieldDescription.trim())
                }
            } else {
                fieldSchema = isTimestamp()
                if (field.min) {
                    fieldSchema = fieldSchema.refine((data: any) => data.toMillis() >= field.min!, {
                        message: `Must be greater than or equal to ${DateTime.fromMillis(field.min).toLocaleString(DateTime.DATE_MED)}`,
                    })
                }
                if (field.max) {
                    fieldSchema = fieldSchema.refine((data: any) => data.toMillis() <= field.max!, {
                        message: `Must be less than or equal to ${DateTime.fromMillis(field.max).toLocaleString(DateTime.DATE_MED)}`,
                    })
                }
            }

            break
        case "Array":
            fieldSchema = z.array(z.any())
            if (field.length) {
                fieldSchema = fieldSchema.length(field.length, `Must contain ${field.length} item(s)`)
            }
            if (field.minlength) {
                fieldSchema = fieldSchema.min(field.minlength, `Must contain at least ${field.minlength} item(s)`)
            } else if (field.required && !hidden) {
                fieldSchema = fieldSchema.nonempty("Must contain at least one item")
            }
            if (field.maxlength) {
                fieldSchema = fieldSchema.max(field.maxlength, `Must contain at most ${field.maxlength} item(s)`)
            }
            if (field.values) {
                if (!chat) {
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
                        { message: `Must only contain the following values: ${field.values.join(", ")}` },
                    )
                }
                fieldSchema = fieldSchema.describe(
                    `${fieldDescription}Must only contain the following values: ${field.values.join(", ")}`,
                )
            } else if (fieldDescription) {
                fieldSchema = fieldSchema.describe(fieldDescription.trim())
            }
            if (field.nullable) {
                fieldSchema = fieldSchema.nullable()
            }
            break
        case "Map":
            if (field.required && !hidden) {
                if (!chat) {
                    fieldSchema = z
                        .record(z.any())
                        .refine((data: any) => data && typeof data === "object" && Object.keys(data).length > 0, {
                            message: "Must not be an empty value",
                        })
                } else {
                    fieldSchema = z
                        .object({})
                        .catchall(z.any())
                        .describe(`${fieldDescription}Must be an object. Must contain at least one object property.`)
                }
            } else {
                fieldSchema = z.object({}).catchall(z.any()).describe(`${fieldDescription}Must be an object`)
            }
            break
        case "Computed":
            fieldSchema = z.any()
    }
    if (!field.required || hidden || skipFormRequiredValidation) {
        fieldSchema = fieldSchema!.optional()
    }
    return fieldSchema
}

export const getInputSchema = (
    collection: CollectionSchema,
    schema: CollectionsSchema,
    customization?: CollectionCustomization,
    chat?: boolean,
    updateMany?: boolean,
) => {
    const { auth, softDelete } = collection
    const fields: { [key: string]: any } = {}
    collection.fields.forEach((field: CollectionField) => {
        if (field.type === "Embedding" || (chat && field.type === "Computed")) {
            return
        }
        if (chat && (field.name === softDelete?.archivedField || field.name === softDelete?.timestampField)) {
            return
        }
        if (isRelationField(field)) {
            fields[field.name] = isRelationObject(field, schema, customization, chat) as any
            if (!chat) {
                if (field.length) {
                    fields[field.name] = fields[field.name].refine(
                        (data: any) => field.length && data && Object.keys(data).length === field.length,
                        {
                            message: `Must contain ${field.length} item(s)`,
                        },
                    )
                }
                if (field.min) {
                    fields[field.name] = fields[field.name].refine(
                        (data: any) => field.min && data && Object.keys(data).length >= field.min,
                        {
                            message: `Must contain at least ${field.min} item(s)`,
                        },
                    )
                }
                if (field.max) {
                    fields[field.name] = fields[field.name].refine(
                        (data: any) => field.max && (!data || Object.keys(data).length <= field.max),
                        {
                            message: `Must contain at most ${field.max} item(s)`,
                        },
                    )
                }
            } else {
                if (field.length) {
                    fields[field.name] = fields[field.name].describe(`Must contain ${field.length} item(s)`)
                }
                if (field.min) {
                    fields[field.name] = fields[field.name].describe(`Must contain at least ${field.min} item(s)`)
                }
                if (field.max) {
                    fields[field.name] = fields[field.name].describe(`Must contain at most ${field.max} item(s)`)
                }
            }
        } else {
            fields[field.name] = getFieldSchema(field, customization, chat)
        }
        if (updateMany) {
            fields[field.name] = fields[field.name].optional()
        }
    })
    if (!chat && auth) {
        fields.operation = z.union([z.literal("create"), z.literal("update"), z.literal("delete")]).optional()
        fields.password = z.string().optional()
        fields.passwordConfirm = z.string().optional()
        Object.values(schema.collections).forEach((permissionsCollection) => {
            fields[`auth-${permissionsCollection.labels.collection}`] = z.boolean().optional()
            fields[`operations-${permissionsCollection.labels.collection}`] = z
                .array(z.union([z.literal("Read"), z.literal("Create"), z.literal("Update"), z.literal("Delete")]))
                .optional()
            fields[`restrict-${permissionsCollection.labels.collection}`] = z.boolean().optional()
            permissionsCollection.access.attributeRestrictions?.forEach((restriction) => {
                fields[`attribute-${permissionsCollection.labels.collection}-${restriction.type}`] = z
                    .boolean()
                    .optional()
            })
            permissionsCollection.access.entityRestrictions?.restrictions?.forEach((restriction) => {
                if (restriction.type === "Individual") {
                    fields[
                        `accessible-${permissionsCollection.labels.collection}-${permissionsCollection.labels.collection}`
                    ] = z.object({}).catchall(z.any()).optional()
                }
                if (restriction.type === "Parent" || restriction.type === "Parent_Property") {
                    const collectionField = getField(
                        permissionsCollection.fields,
                        restriction.collectionField,
                    ) as RelationField
                    fields[`accessible-${permissionsCollection.labels.collection}-${collectionField.collection}`] = z
                        .object({})
                        .catchall(z.any())
                        .optional()
                }
            })
        })
    }

    const record = z.object(fields)

    if (collection.allowSchemalessFields) {
        return record.passthrough()
    } else {
        return record.strict()
    }
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

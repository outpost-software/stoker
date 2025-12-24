import { input, password, select } from "@inquirer/prompts"
import { addRecord, fetchCurrentSchema, getOne, initializeStoker } from "@stoker-platform/node-client"
import {
    AccessOperations,
    NodeUtilities,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import { getField, getFieldCustomization, isRelationField } from "@stoker-platform/utils"
import { Timestamp } from "firebase-admin/firestore"
import { join } from "node:path"

export const addRecordPrompt = async (
    tenantId: string,
    collectionName: StokerCollection,
    fullAccess?: boolean,
    mode?: "development" | "production",
    relationIds?: Record<string, string>,
) => {
    const { getCustomizationFile } = (await initializeStoker(
        mode || "production",
        tenantId,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )) as NodeUtilities

    const schema = await fetchCurrentSchema()
    // eslint-disable-next-line security/detect-object-injection
    const collection = schema.collections[collectionName]
    if (!collection) throw new Error(`Collection ${collectionName} not found in schema`)
    if (collection.parentCollection) throw new Error("The CLI prompt does not support adding to subcollections")
    const { labels, fields, softDelete } = collection
    const record: Partial<StokerRecord> = {}
    const user = {} as { permissions: StokerPermissions; password: string }
    const customization = getCustomizationFile(labels.collection, schema)
    for (const field of fields) {
        const fieldCustomization = getFieldCustomization(field, customization)
        if (
            !("autoIncrement" in field && field.autoIncrement) &&
            !fieldCustomization.custom?.initialValue &&
            !(collection.auth && field.name === "User_ID") &&
            !(softDelete && (field.name === softDelete.archivedField || field.name === softDelete.timestampField)) &&
            !(isRelationField(field) && ["ManyToMany", "ManyToOne"].includes(field.type)) &&
            field.type !== "Embedding" &&
            field.type !== "Array" &&
            field.type !== "Map"
        ) {
            if (isRelationField(field)) {
                let value: string | undefined
                if (relationIds?.[field.collection]) {
                    value = relationIds[field.collection]
                } else {
                    value = await input({
                        message: `${labels.collection}- ${field.name}${field.required ? "*" : ""}`,
                    })
                }
                if (value) {
                    /* eslint-disable security/detect-object-injection */
                    const relationRecord = await getOne([field.collection], value)
                    record[field.name] ||= {}
                    record[field.name][value] = {
                        Collection_Path: relationRecord.Collection_Path,
                    }
                    if (field.includeFields) {
                        for (const includeField of field.includeFields) {
                            if (relationRecord[includeField]) {
                                record[field.name][value][includeField] = relationRecord[includeField]
                            }
                        }
                    }
                    /* eslint-enable security/detect-object-injection */
                }
            } else if (field.type === "Timestamp") {
                const value = await input({
                    message: `${labels.collection}- ${field.name}${field.required ? "*" : ""}`,
                })
                if (value) {
                    record[field.name] = Timestamp.fromMillis(Number(value))
                }
            } else if (field.type !== "Boolean") {
                if ("values" in field && field.values) {
                    record[field.name] = await select({
                        message: `${labels.collection}- ${field.name}${field.required ? "*" : ""}`,
                        choices: field.values.map((value) => {
                            return { value: value }
                        }),
                    })
                } else {
                    const value = await input({
                        message: `${labels.collection}- ${field.name}${field.required ? "*" : ""}`,
                    })
                    if (field.type === "Number") {
                        record[field.name] = Number(value)
                    } else {
                        record[field.name] = value
                    }
                }
            } else {
                record[field.name] = await select({
                    message: `${labels.collection}- ${field.name}${field.required ? "*" : ""}`,
                    choices: [
                        { name: "TRUE", value: true },
                        { name: "FALSE", value: false },
                    ],
                })
            }
        }
    }
    if (collection.auth) {
        user.permissions = {} as StokerPermissions
        user.permissions.Role = record.Role
        user.permissions.collections = {}
        for (const [collectionName, collection] of Object.entries(schema.collections)) {
            // eslint-disable-next-line security/detect-object-injection
            user.permissions.collections[collectionName] = {
                operations: [],
            }
            const assignable = collection.access.operations.assignable
            for (const operationType of ["read", "create", "update", "delete"]) {
                const operationTypeUpper = (operationType.charAt(0).toUpperCase() + operationType.slice(1)) as
                    | "Read"
                    | "Create"
                    | "Update"
                    | "Delete"
                const operation = collection.access.operations[operationType as keyof AccessOperations]
                if (typeof operation === "object" && operation.includes(record.Role)) {
                    if (fullAccess) {
                        // eslint-disable-next-line security/detect-object-injection
                        user.permissions.collections[collectionName].operations.push(operationTypeUpper)
                    } else {
                        if (
                            !(
                                assignable === true ||
                                (typeof assignable === "object" && assignable?.includes(record.Role))
                            )
                        ) {
                            // eslint-disable-next-line security/detect-object-injection
                            user.permissions.collections[collectionName].operations.push(operationTypeUpper)
                        }
                    }
                }
            }
            if (collection.auth && collection.access.auth?.includes(record.Role)) {
                // eslint-disable-next-line security/detect-object-injection
                user.permissions.collections[collectionName].auth = true
            }
            if (collection.access.attributeRestrictions) {
                for (const attributeRestriction of collection.access.attributeRestrictions) {
                    if ("roles" in attributeRestriction) {
                        const role = attributeRestriction.roles.find((role) => role.role === record.Role)
                        if (!role) continue
                        if (role.assignable) continue
                        if (attributeRestriction.type === "Record_Owner") {
                            // eslint-disable-next-line security/detect-object-injection
                            user.permissions.collections[collectionName].recordOwner = { active: true }
                        }
                        if (attributeRestriction.type === "Record_User") {
                            // eslint-disable-next-line security/detect-object-injection
                            user.permissions.collections[collectionName].recordUser = { active: true }
                        }
                        if (attributeRestriction.type === "Record_Property") {
                            // eslint-disable-next-line security/detect-object-injection
                            user.permissions.collections[collectionName].recordProperty = { active: true }
                        }
                    }
                }
            }
            if (collection.access.entityRestrictions?.restrictions) {
                if (collection.access.entityRestrictions?.assignable?.includes(record.Role)) continue
                let hasEntityRestrictions = false
                for (const entityRestriction of collection.access.entityRestrictions.restrictions) {
                    if ("roles" in entityRestriction) {
                        const role = entityRestriction.roles.find((role) => role.role === record.Role)
                        if (!role) continue
                        if (entityRestriction.type === "Individual") {
                            // eslint-disable-next-line security/detect-object-injection
                            user.permissions.collections[collectionName].individualEntities = []
                            hasEntityRestrictions = true
                        }
                        if (entityRestriction.type === "Parent") {
                            // eslint-disable-next-line security/detect-object-injection
                            const collectionField = getField(collection.fields, entityRestriction.collectionField)
                            if (isRelationField(collectionField)) {
                                // eslint-disable-next-line security/detect-object-injection
                                user.permissions.collections[collectionName].parentEntities = []
                                hasEntityRestrictions = true
                            }
                        }
                        if (entityRestriction.type === "Parent_Property") {
                            const collectionField = getField(collection.fields, entityRestriction.collectionField)
                            if (isRelationField(collectionField)) {
                                // eslint-disable-next-line security/detect-object-injection
                                user.permissions.collections[collectionName].parentPropertyEntities = {}
                                hasEntityRestrictions = true
                            }
                        }
                    }
                }
                if (hasEntityRestrictions) {
                    // eslint-disable-next-line security/detect-object-injection
                    user.permissions.collections[collectionName].restrictEntities = true
                }
            }
        }
        user.password = await password({
            message: `${labels.collection}- Password*`,
            mask: true,
        })
    }
    for (const field of Object.entries(record)) {
        const [fieldName, fieldValue] = field
        if (fieldValue === "") {
            // eslint-disable-next-line security/detect-object-injection
            delete record[fieldName]
        }
    }
    const result = await addRecord([labels.collection], record, user)

    console.log(result)

    return result
}

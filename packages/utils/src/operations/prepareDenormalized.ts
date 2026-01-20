import {
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    RelationField,
    StokerCollection,
    StokerRecord,
    StokerRelation,
    StokerRole,
} from "@stoker-platform/types"
import { isRelationField } from "../schema/isRelationField.js"
import { getDependencyIndexFields, getRoleExcludedFields } from "../schema/getIndexFields.js"
import { isDependencyField } from "../schema/isDependencyField.js"
import { getFieldNames } from "../schema/getFieldNames.js"
import { getField } from "../schema/getField.js"
import { isDeleteSentinel } from "./isDeleteSentinel.js"
import { removeDeleteSentinels } from "./removeDeleteSentinels.js"
import { getSingleFieldRelations } from "./getSingleFieldRelations.js"
import { getLowercaseFields } from "./getLowercaseFields.js"
import { getRecordSystemFields } from "../schema/getRecordSystemFields.js"

export const prepareDenormalized = (
    operation: "create" | "update" | "delete",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    batch: any,
    path: string[],
    docId: string,
    record: StokerRecord,
    schema: CollectionsSchema,
    collectionSchema: CollectionSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
    allRoleGroups: Record<
        StokerCollection,
        Set<{
            key: string
            roles: StokerRole[]
            fields: CollectionField[]
        }>
    >,
    arrayUnion: (docid: string) => unknown,
    arrayRemove: (docid: string) => unknown,
    deleteField: () => unknown,
    dependencyRef: (field: CollectionField) => unknown,
    uniqueRef: (field: CollectionField, uniqueValue: string) => unknown,
    privateRef: (role: StokerRole) => unknown,
    twoWayIncludeRef: (path: string[], id: string) => unknown,
    twoWayDependencyRef: (field: RelationField, dependencyField: string, id: string) => unknown,
    twoWayPrivateRef: (field: RelationField, role: StokerRole, id: string) => unknown,
    originalRecord?: StokerRecord,
    noDelete?: Map<string, string[]>,
    batchSize?: { size: number },
) => {
    const { fields } = collectionSchema

    fields
        .filter((field: CollectionField) => "unique" in field && field.unique)
        .forEach((field: CollectionField) => {
            if (
                operation !== "delete" &&
                (typeof record[field.name] === "string" || typeof record[field.name] === "number")
            ) {
                batch.set(
                    uniqueRef(
                        field,
                        record[field.name].toString().toLowerCase().replace(/\s/g, "---").replaceAll("/", "|||"),
                    ),
                    {
                        id: docId,
                        Collection_Path: path,
                    },
                )
                if (batchSize) batchSize.size++
            }
        })

    fields.forEach((field: CollectionField) => {
        if (isDependencyField(field, collectionSchema, schema)) {
            const dependencyFieldsSchema = getDependencyIndexFields(field, collectionSchema, schema)
            const dependencyFields = {} as StokerRecord
            if (record[field.name] !== undefined) {
                dependencyFields[field.name] = record[field.name]
                if (isRelationField(field)) {
                    dependencyFields[`${field.name}_Array`] = record[`${field.name}_Array`]
                }
            }
            dependencyFieldsSchema.forEach((dependencyField) => {
                if (record[dependencyField.name] !== undefined) {
                    if (isRelationField(dependencyField)) {
                        dependencyFields[`${dependencyField.name}_Array`] = record[`${dependencyField.name}_Array`]
                    } else {
                        dependencyFields[dependencyField.name] = record[dependencyField.name]
                    }
                }
            })
            if (Object.keys(dependencyFields).length > 0) {
                if (operation === "create") {
                    dependencyFields.Collection_Path = path
                    dependencyFields.Collection_Path_String = path.join("/")
                    batch.set(dependencyRef(field), dependencyFields)
                }
                if (operation === "update") {
                    batch.update(dependencyRef(field), dependencyFields)
                }
                if (operation === "delete") {
                    batch.delete(dependencyRef(field))
                }
                if (batchSize) batchSize.size++
            }
        }
    })

    const roleGroups = allRoleGroups[collectionSchema.labels.collection]
    for (const group of roleGroups) {
        const excludedFields = getRoleExcludedFields(group, collectionSchema)
        const recordToUpdate = { ...record }
        excludedFields.forEach((field) => {
            delete recordToUpdate[field.name]
            delete recordToUpdate[`${field.name}_Array`]
            delete recordToUpdate[`${field.name}_Single`]
            delete recordToUpdate[`${field.name}_Lowercase`]
        })
        if (Object.keys(recordToUpdate).length > 0) {
            if (operation === "create") {
                recordToUpdate.Collection_Path ||= path
                recordToUpdate.Collection_Path_String = path.join("/")
                batch.set(privateRef(group.key), recordToUpdate)
            }
            if (operation === "update") {
                batch.update(privateRef(group.key), recordToUpdate)
            }
            if (operation === "delete") {
                batch.delete(privateRef(group.key))
            }
            if (batchSize) batchSize.size++
        }
    }

    const getDeleteFieldBatchSize = (targetSchema: CollectionSchema, targetField: RelationField) => {
        let batchSize = 1
        if (isDependencyField(targetField, targetSchema, schema)) {
            batchSize++
        }
        targetSchema.fields.forEach((targetSchemaField) => {
            if (isDependencyField(targetSchemaField, targetSchema, schema)) {
                const targetIndexFields = JSON.parse(
                    getFieldNames(getDependencyIndexFields(targetSchemaField, targetSchema, schema)),
                )
                if (targetIndexFields.includes(targetField.name)) {
                    batchSize++
                }
            }
        })
        const targetRoleGroups = allRoleGroups[targetSchema.labels.collection]
        for (const group of targetRoleGroups) {
            if (
                group.fields.some((groupField) => groupField.name === targetField.name) &&
                isRelationField(targetField)
            ) {
                batchSize++
            }
        }
        return batchSize
    }

    const deleteFields = (
        field: RelationField,
        targetSchema: CollectionSchema,
        targetField: RelationField,
        id: string,
        relationPath: string[],
    ) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fieldUpdate: any = {}
        fieldUpdate[`${targetField.name}.${docId}`] = deleteField()
        fieldUpdate[`${targetField.name}_Array`] = arrayRemove(docId)
        fieldUpdate[`${targetField.name}_Single`] = deleteField()
        batch.update(twoWayIncludeRef(relationPath, id), fieldUpdate)
        if (isDependencyField(targetField, targetSchema, schema)) {
            batch.update(twoWayDependencyRef(field, targetField.name, id), {
                [`${targetField.name}.${docId}`]: deleteField(),
                [`${targetField.name}_Array`]: arrayRemove(docId),
            })
        }
        targetSchema.fields.forEach((targetSchemaField) => {
            if (isDependencyField(targetSchemaField, targetSchema, schema)) {
                const targetIndexFields = JSON.parse(
                    getFieldNames(getDependencyIndexFields(targetSchemaField, targetSchema, schema)),
                )
                if (targetIndexFields.includes(targetField.name)) {
                    batch.update(twoWayDependencyRef(field, targetSchemaField.name, id), {
                        [`${targetField.name}_Array`]: arrayRemove(docId),
                    })
                }
            }
        })
        const targetRoleGroups = allRoleGroups[targetSchema.labels.collection]
        for (const group of targetRoleGroups) {
            if (
                group.fields.some((groupField) => groupField.name === targetField.name) &&
                isRelationField(targetField)
            ) {
                batch.update(twoWayPrivateRef(field, group.key, id), fieldUpdate)
            }
        }
    }

    if (operation === "delete") return

    const twoWayFields = fields.filter(
        (field: CollectionField) => isRelationField(field) && field.twoWay,
    ) as RelationField[]
    if (options?.noTwoWay) return
    for (const field of twoWayFields) {
        if (!batchSize) throw new Error("VALIDATION_ERROR: batchSize is required")
        const targetSchema = schema.collections[field.collection]
        const targetField = getField(targetSchema.fields, field.twoWay)
        const targetSingleFieldRelations = getSingleFieldRelations(targetSchema, targetSchema.fields)
        const targetSingleFieldRelationsNames = Array.from(targetSingleFieldRelations).map((field) => field.name)
        if (!targetField)
            throw new Error(`SCHEMA_ERROR: Field ${field.twoWay} not found in collection ${field.collection}`)
        if (isRelationField(targetField)) {
            if (record[`${field.name}_Array`]) {
                for (const [id, relation] of Object.entries(record[field.name])) {
                    if (operation === "update" && originalRecord && originalRecord[`${field.name}_Array`]?.includes(id))
                        continue

                    const finalRecord = { ...originalRecord, ...record }
                    removeDeleteSentinels(finalRecord)
                    const includeFields: Record<string, unknown> = {}
                    if (targetField.includeFields) {
                        targetField.includeFields.forEach((includeField: string) => {
                            // eslint-disable-next-line security/detect-object-injection
                            if (finalRecord[includeField] !== undefined) {
                                // eslint-disable-next-line security/detect-object-injection
                                includeFields[includeField] = finalRecord[includeField]
                                const includeFieldSchema = getField(collectionSchema.fields, includeField)
                                const lowercaseFields = getLowercaseFields(collectionSchema, [includeFieldSchema])
                                if (lowercaseFields.size === 1) {
                                    includeFields[`${includeField}_Lowercase`] =
                                        finalRecord[`${includeField}_Lowercase`]
                                }
                            }
                        })
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const fieldUpdate: any = {
                        [`${field.twoWay}.${docId}`]: {
                            Collection_Path: path,
                            ...includeFields,
                        },
                        [`${field.twoWay}_Array`]: arrayUnion(docId),
                    }
                    if (targetSingleFieldRelationsNames.includes(targetField.name)) {
                        fieldUpdate[`${field.twoWay}_Single`] = {
                            Collection_Path: path,
                            ...includeFields,
                        }
                    }

                    const systemFields = getRecordSystemFields(record)
                    batch.update(twoWayIncludeRef((relation as StokerRelation).Collection_Path, id), {
                        ...fieldUpdate,
                        ...systemFields,
                    })
                    batchSize.size++
                    if (isDependencyField(targetField, targetSchema, schema)) {
                        batch.update(twoWayDependencyRef(field, targetField.name, id), {
                            [`${targetField.name}.${docId}`]: {
                                Collection_Path: path,
                                ...includeFields,
                            },
                            [`${targetField.name}_Array`]: arrayUnion(docId),
                        })
                        batchSize.size++
                    }
                    targetSchema.fields.forEach((targetSchemaField) => {
                        if (isDependencyField(targetSchemaField, targetSchema, schema)) {
                            const targetIndexFields = JSON.parse(
                                getFieldNames(getDependencyIndexFields(targetSchemaField, targetSchema, schema)),
                            )
                            const dependencyFieldUpdate: Record<string, unknown> = {}
                            if (targetIndexFields.includes(targetField.name)) {
                                dependencyFieldUpdate[`${field.twoWay}_Array`] = arrayUnion(docId)
                            }
                            Object.keys(systemFields).forEach((systemField) => {
                                if (targetIndexFields.includes(systemField)) {
                                    // eslint-disable-next-line security/detect-object-injection
                                    dependencyFieldUpdate[systemField] = systemFields[systemField]
                                }
                            })
                            if (Object.keys(dependencyFieldUpdate).length > 0) {
                                batch.update(
                                    twoWayDependencyRef(field, targetSchemaField.name, id),
                                    dependencyFieldUpdate,
                                )
                                batchSize.size++
                            }
                        }
                    })
                    const targetRoleGroups = allRoleGroups[targetSchema.labels.collection]
                    for (const group of targetRoleGroups) {
                        if (group.fields.some((groupField) => groupField.name === targetField.name)) {
                            const groupFieldUpdate = { ...fieldUpdate }
                            Object.keys(systemFields).forEach((systemField) => {
                                if (group.fields.some((groupField) => groupField.name === systemField)) {
                                    // eslint-disable-next-line security/detect-object-injection
                                    groupFieldUpdate[systemField] = systemFields[systemField]
                                }
                            })
                            if (Object.keys(groupFieldUpdate).length > 0) {
                                batch.update(twoWayPrivateRef(field, group.key, id), groupFieldUpdate)
                                batchSize.size++
                            }
                        }
                    }
                }
            }
        } else throw new Error(`SCHEMA_ERROR: Invalid field type: ${targetField.type}`)
    }
    if (batchSize && batchSize.size > 500) {
        console.error(
            new Error(
                `VALIDATION_ERROR: ${batchSize.size} operations in the Firestore transaction has exceeded the recommended limit of 500. This is likely due to a large number of two way updates, roles, dependencies on the collection, unique field checks, entity restrictions (in permissions when dealing with user collections) or relation hierarchy checks.`,
            ),
        )
    }
    for (const field of twoWayFields) {
        if (!batchSize) throw new Error("VALIDATION_ERROR: batchSize is required")
        const targetSchema = schema.collections[field.collection]
        const targetField = getField(targetSchema.fields, field.twoWay)
        if (!targetField)
            throw new Error(`SCHEMA_ERROR: Field ${field.twoWay} not found in collection ${field.collection}`)
        if (isRelationField(targetField)) {
            if (operation === "update") {
                if (
                    originalRecord &&
                    !(record[field.name] && isDeleteSentinel(record[field.name])) &&
                    record[`${field.name}_Array`] &&
                    originalRecord[`${field.name}_Array`]?.length > 0
                ) {
                    for (const [id, relation] of Object.entries(originalRecord[field.name])) {
                        if (!record[`${field.name}_Array`].includes(id) && !noDelete?.get(field.name)?.includes(id)) {
                            batchSize.size += getDeleteFieldBatchSize(targetSchema, targetField)
                            if (batchSize.size <= 500) {
                                deleteFields(
                                    field,
                                    targetSchema,
                                    targetField,
                                    id,
                                    (relation as StokerRelation).Collection_Path,
                                )
                            }
                        }
                    }
                }
            }
        } else throw new Error(`SCHEMA_ERROR: Invalid field type: ${targetField.type}`)
    }
    for (const field of twoWayFields) {
        if (!batchSize) throw new Error("VALIDATION_ERROR: batchSize is required")
        const targetSchema = schema.collections[field.collection]
        const targetField = getField(targetSchema.fields, field.twoWay)
        if (!targetField)
            throw new Error(`SCHEMA_ERROR: Field ${field.twoWay} not found in collection ${field.collection}`)
        if (isRelationField(targetField)) {
            if (operation === "update") {
                if (
                    originalRecord &&
                    record[field.name] &&
                    isDeleteSentinel(record[field.name]) &&
                    originalRecord[`${field.name}_Array`]?.length > 0
                ) {
                    for (const [id, relation] of Object.entries(originalRecord[field.name])) {
                        if (!noDelete?.get(field.name)?.includes(id)) {
                            batchSize.size += getDeleteFieldBatchSize(targetSchema, targetField)
                            if (batchSize.size <= 500) {
                                deleteFields(
                                    field,
                                    targetSchema,
                                    targetField,
                                    id,
                                    (relation as StokerRelation).Collection_Path,
                                )
                            }
                        }
                    }
                }
            }
        } else throw new Error(`SCHEMA_ERROR: Invalid field type: ${targetField.type}`)
    }
    return
}

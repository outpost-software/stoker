import {
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    RelationField,
    StokerCollection,
    StokerPermissions,
    StokerRecord,
    StokerRelation,
} from "@stoker-platform/types"
import {
    canUpdateField,
    documentAccess,
    getField,
    getLowercaseFields,
    getRecordSystemFields,
    getSingleFieldRelations,
    isRelationField,
    validateRecord,
} from "@stoker-platform/utils"
import { CollectionReference, getFirestore, Transaction } from "firebase-admin/firestore"
import { getFirestorePathRef } from "../utils/getFirestorePathRef.js"
import { getCustomizationFile } from "../initializeStoker.js"
import isEqual from "lodash/isEqual.js"
import cloneDeep from "lodash/cloneDeep.js"

const getIncludeFields = (collectionSchema: CollectionSchema, record: StokerRecord, field: CollectionField) => {
    if (isRelationField(field) && field.includeFields) {
        const includeFields: Record<string, unknown> = {}
        field.includeFields.forEach((includeField: string) => {
            // eslint-disable-next-line security/detect-object-injection
            if (record[includeField] !== undefined) {
                // eslint-disable-next-line security/detect-object-injection
                includeFields[includeField] = record[includeField]
                const includeFieldSchema = getField(collectionSchema.fields, includeField)
                const lowercaseFields = getLowercaseFields(collectionSchema, [includeFieldSchema])
                if (lowercaseFields.size === 1) {
                    includeFields[`${includeField}_Lowercase`] = record[`${includeField}_Lowercase`]
                }
            }
        })
        return includeFields
    }
    return {}
}

export const validateRelationHierarchy = async (
    tenantId: string,
    collection: CollectionSchema,
    field: CollectionField,
    record: StokerRecord,
    transaction: Transaction,
    batchSize: { size: number },
    isRelationCheck?: boolean,
) => {
    if (!isRelationField(field) || !field.enforceHierarchy) return
    const { fields } = collection
    const db = getFirestore()
    const relationEntries = Object.entries(record[field.name])
    if (!relationEntries.length) {
        throw new Error(`VALIDATION_ERROR: relation ${field.name} is required`)
    }
    const [id, relation] = relationEntries[0] as [string, StokerRelation]
    if (!relation) {
        throw new Error(`VALIDATION_ERROR: Relation ${field.name} is required`)
    }
    const ref = getFirestorePathRef(db, relation.Collection_Path, tenantId) as CollectionReference
    batchSize.size++
    if (!isRelationCheck && batchSize.size > 500) {
        throw new Error(
            `VALIDATION ERROR: The number of operations in the Firestore transaction has exceeded the limit of 500. This is likely due to a large number of unique field checks, entity restrictions (in permissions when dealing with user collections) or relation hierarchy checks.`,
        )
    }
    const relatedRecordSnapshot = await transaction.get(ref.doc(id))
    if (!relatedRecordSnapshot.exists) {
        throw new Error(`VALIDATION_ERROR: Record ${id} not found in collection ${field.collection}`)
    }
    const relatedRecord = relatedRecordSnapshot.data() as StokerRecord
    const parentField = getField(fields, field.enforceHierarchy.field)
    const enforceHierarchy = field.enforceHierarchy
    if (
        !relatedRecord[enforceHierarchy.recordLinkField] ||
        !record[parentField.name] ||
        !Object.keys(record[parentField.name]).every((parentRelation) =>
            Object.keys(relatedRecord[enforceHierarchy.recordLinkField]).includes(parentRelation),
        )
    ) {
        throw new Error("VALIDATION_ERROR: Invalid relation hierarchy")
    }
}

const deleteRelation = async (field: CollectionField, partial: Partial<StokerRecord>, id: string) => {
    // eslint-disable-next-line security/detect-object-injection
    delete partial[field.name][id]
    partial[`${field.name}_Array`] = partial[`${field.name}_Array`]?.filter((relationId: string) => relationId !== id)
    delete partial[`${field.name}_Single`]
}

const restoreRelation = async (
    field: CollectionField,
    partial: Partial<StokerRecord>,
    relation: StokerRelation,
    id: string,
    singleFieldRelation: boolean,
) => {
    partial[field.name] ||= {}
    // eslint-disable-next-line security/detect-object-injection
    partial[field.name][id] = relation
    partial[`${field.name}_Array`] ||= []
    partial[`${field.name}_Array`].push(id)
    if (singleFieldRelation) {
        partial[`${field.name}_Single`] = relation
    }
}

const getChangedFields = (
    operation: "Create" | "Update",
    relationId: string,
    relationCollection: StokerCollection,
    collection: CollectionSchema,
    record: StokerRecord,
    originalRecord?: StokerRecord,
) => {
    const addedFields: RelationField[] = []
    const removedFields: RelationField[] = []
    for (const field of collection.fields) {
        if (isRelationField(field)) {
            if (field.twoWay && field.collection === relationCollection) {
                // eslint-disable-next-line security/detect-object-injection
                if (operation === "Create" || !originalRecord?.[field.name]?.[relationId]) {
                    // eslint-disable-next-line security/detect-object-injection
                    if (record[field.name]?.[relationId]) {
                        addedFields.push(field)
                    }
                }
                if (operation === "Update") {
                    // eslint-disable-next-line security/detect-object-injection
                    if (originalRecord?.[field.name]?.[relationId] && !record[field.name]?.[relationId]) {
                        removedFields.push(field)
                    }
                }
            }
        }
    }
    return { addedFields, removedFields }
}

export const validateRelations = async (
    operation: "Create" | "Update",
    tenantId: string,
    docId: string,
    record: StokerRecord,
    partial: Partial<StokerRecord>,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    transaction: Transaction,
    batchSize: { size: number },
    userId?: string,
    permissions?: StokerPermissions,
    originalRecord?: StokerRecord,
) => {
    const { fields } = collectionSchema
    const db = getFirestore()
    const noDelete = new Map<string, string[]>()
    const originalRelationRecords = new Map<StokerCollection, Record<string, StokerRecord>>()
    const updatedRelationRecords = new Map<StokerCollection, Record<string, StokerRecord>>()
    for (const field of fields) {
        if (isRelationField(field)) {
            if (["OneToOne", "OneToMany"].includes(field.type)) {
                if (field.enforceHierarchy) {
                    if (
                        record[field.name] &&
                        (operation === "Create" ||
                            (operation === "Update" && !isEqual(originalRecord?.[field.name], record[field.name])))
                    ) {
                        await validateRelationHierarchy(
                            tenantId,
                            collectionSchema,
                            field,
                            record,
                            transaction,
                            batchSize,
                        )
                    }
                }
            }
        }
    }
    for (const field of fields) {
        if (isRelationField(field)) {
            if (field.twoWay) {
                const relationCollection = schema.collections[field.collection]
                const targetField = getField(relationCollection.fields, field.twoWay)
                const singleFieldRelations = getSingleFieldRelations(relationCollection, [targetField])
                if (record[field.name]) {
                    const relationEntries = Object.entries(record[field.name])
                    for (const relationEntry of relationEntries) {
                        const [id, relation] = relationEntry as [string, StokerRelation]
                        // eslint-disable-next-line security/detect-object-injection
                        if (operation === "Create" || !originalRecord?.[field.name]?.[id]) {
                            let updatedRecord: StokerRecord
                            // eslint-disable-next-line security/detect-object-injection
                            const savedRelationRecord = updatedRelationRecords.get(field.collection)?.[id]
                            if (savedRelationRecord) {
                                updatedRecord = savedRelationRecord
                            } else {
                                batchSize.size++
                                if (batchSize && batchSize.size > 500) {
                                    throw new Error(
                                        `VALIDATION_ERROR: The number of operations in the Firestore transaction has exceeded the limit of 500. This is likely due to a large number of two way updates, unique field checks, entity restrictions (in permissions when dealing with user collections) or relation hierarchy checks.`,
                                    )
                                }
                                const ref = getFirestorePathRef(
                                    db,
                                    relation.Collection_Path,
                                    tenantId,
                                ) as CollectionReference
                                const relatedRecordSnapshot = await transaction.get(ref.doc(id))
                                if (!relatedRecordSnapshot.exists) {
                                    deleteRelation(field, partial, id)
                                    continue
                                }
                                const serverRecord = relatedRecordSnapshot.data() as StokerRecord
                                originalRelationRecords.set(field.collection, {
                                    ...(originalRelationRecords.get(field.collection) || {}),
                                    [id]: serverRecord,
                                })
                                updatedRecord = cloneDeep({ ...serverRecord, ...getRecordSystemFields(record) })
                            }
                            const mainRelation = {
                                ...updatedRecord[targetField.name],
                                [docId]: {
                                    Collection_Path: record.Collection_Path,
                                    ...getIncludeFields(collectionSchema, record, targetField),
                                },
                            }
                            updatedRecord[targetField.name] = mainRelation
                            updatedRecord[`${targetField.name}_Array`] ||= []
                            updatedRecord[`${targetField.name}_Array`].push(docId)
                            if (singleFieldRelations.size === 1) {
                                updatedRecord[`${targetField.name}_Single`] = mainRelation
                            }
                            updatedRelationRecords.set(field.collection, {
                                ...(updatedRelationRecords.get(field.collection) || {}),
                                [id]: updatedRecord,
                            })
                        }
                    }
                }
                if (operation === "Update") {
                    const originalRelationEntries = Object.entries(originalRecord?.[field.name] || {})
                    for (const relationEntry of originalRelationEntries) {
                        const [id, relation] = relationEntry as [string, StokerRelation]
                        // eslint-disable-next-line security/detect-object-injection
                        if (!record[field.name]?.[id]) {
                            let updatedRecord: StokerRecord
                            // eslint-disable-next-line security/detect-object-injection
                            const savedRelationRecord = updatedRelationRecords.get(field.collection)?.[id]
                            if (savedRelationRecord) {
                                updatedRecord = savedRelationRecord
                            } else {
                                batchSize.size++
                                if (batchSize && batchSize.size > 500) {
                                    throw new Error(
                                        `VALIDATION_ERROR: The number of operations in the Firestore transaction has exceeded the limit of 500. This is likely due to a large number of two way updates, unique field checks, entity restrictions (in permissions when dealing with user collections) or relation hierarchy checks.`,
                                    )
                                }
                                const ref = getFirestorePathRef(
                                    db,
                                    relation.Collection_Path,
                                    tenantId,
                                ) as CollectionReference
                                const relatedRecordSnapshot = await transaction.get(ref.doc(id))
                                if (!relatedRecordSnapshot.exists) {
                                    noDelete.set(field.name, [...(noDelete.get(field.name) || []), id])
                                    continue
                                }
                                const serverRecord = relatedRecordSnapshot.data() as StokerRecord
                                originalRelationRecords.set(field.collection, {
                                    ...(originalRelationRecords.get(field.collection) || {}),
                                    [id]: serverRecord,
                                })
                                updatedRecord = cloneDeep({ ...serverRecord, ...getRecordSystemFields(record) })
                            }
                            // eslint-disable-next-line security/detect-object-injection
                            if (updatedRecord[targetField.name][docId]) {
                                // eslint-disable-next-line security/detect-object-injection
                                delete updatedRecord[targetField.name][docId]
                            }
                            if (Array.isArray(updatedRecord[`${targetField.name}_Array`])) {
                                updatedRecord[`${targetField.name}_Array`] = updatedRecord[
                                    `${targetField.name}_Array`
                                ].filter((id: string) => id !== docId)
                            }
                            if (singleFieldRelations.size === 1) {
                                delete updatedRecord[`${targetField.name}_Single`]
                            }
                            updatedRelationRecords.set(field.collection, {
                                ...(updatedRelationRecords.get(field.collection) || {}),
                                [id]: updatedRecord,
                            })
                        }
                    }
                }
            }
        }
    }
    for (const [collection, records] of updatedRelationRecords.entries()) {
        // eslint-disable-next-line security/detect-object-injection
        const relationCollection = schema.collections[collection]
        const customization = getCustomizationFile(collection, schema)
        for (const [id, updatedRecord] of Object.entries(records)) {
            const { addedFields, removedFields } = getChangedFields(
                operation,
                id,
                collection,
                collectionSchema,
                record,
                originalRecord,
            )
            // eslint-disable-next-line security/detect-object-injection
            if (userId && permissions) {
                for (const field of addedFields) {
                    const targetField = getField(relationCollection.fields, field.twoWay) as RelationField
                    if (!canUpdateField(relationCollection, targetField, permissions)) {
                        deleteRelation(field, partial, id)
                        continue
                    }
                }
                for (const field of removedFields) {
                    const targetField = getField(relationCollection.fields, field.twoWay) as RelationField
                    const singleFieldRelations = getSingleFieldRelations(relationCollection, [targetField])
                    if (!canUpdateField(relationCollection, targetField, permissions)) {
                        restoreRelation(
                            field,
                            partial,
                            // eslint-disable-next-line security/detect-object-injection
                            originalRecord?.[field.name]?.[id],
                            id,
                            singleFieldRelations.size === 1,
                        )
                        continue
                    }
                }
                if (
                    !documentAccess(
                        "Update",
                        relationCollection,
                        schema,
                        userId,
                        permissions,
                        // eslint-disable-next-line security/detect-object-injection
                        originalRelationRecords.get(collection)?.[id] as StokerRecord,
                    )
                ) {
                    for (const field of addedFields) {
                        deleteRelation(field, partial, id)
                        continue
                    }
                    for (const field of removedFields) {
                        const targetField = getField(relationCollection.fields, field.twoWay) as RelationField
                        const singleFieldRelations = getSingleFieldRelations(relationCollection, [targetField])
                        restoreRelation(
                            field,
                            partial,
                            // eslint-disable-next-line security/detect-object-injection
                            originalRecord?.[field.name]?.[id],
                            id,
                            singleFieldRelations.size === 1,
                        )
                        continue
                    }
                }
                if (!documentAccess("Update", relationCollection, schema, userId, permissions, updatedRecord)) {
                    for (const field of addedFields) {
                        deleteRelation(field, partial, id)
                        continue
                    }
                    for (const field of removedFields) {
                        const targetField = getField(relationCollection.fields, field.twoWay) as RelationField
                        const singleFieldRelations = getSingleFieldRelations(relationCollection, [targetField])
                        restoreRelation(
                            field,
                            partial,
                            // eslint-disable-next-line security/detect-object-injection
                            originalRecord?.[field.name]?.[id],
                            id,
                            singleFieldRelations.size === 1,
                        )
                        continue
                    }
                }
            }
            try {
                await validateRecord(
                    "update",
                    updatedRecord,
                    relationCollection,
                    customization,
                    ["update", updatedRecord, {}, undefined, updatedRecord],
                    schema,
                )
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                throw new Error(
                    `VALIDATION_ERROR: Two way relation update would invalidate record ${id} in ${collection}: ${error.message}`,
                )
            }
            for (const field of addedFields) {
                const targetField = getField(relationCollection.fields, field.twoWay) as RelationField
                if (
                    ["OneToOne", "OneToMany"].includes(targetField.type) &&
                    isRelationField(targetField) &&
                    targetField.enforceHierarchy
                ) {
                    await validateRelationHierarchy(
                        tenantId,
                        relationCollection,
                        targetField,
                        updatedRecord,
                        transaction,
                        batchSize,
                        true,
                    )
                }
            }
        }
    }
    return noDelete
}

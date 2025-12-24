import { fetchCurrentSchema, getFirestorePathRef, initializeStoker } from "@stoker-platform/node-client"
import { CollectionField, StokerRecord, StokerRelation } from "@stoker-platform/types"
import { CollectionReference, getFirestore } from "firebase-admin/firestore"
import { join } from "node:path"
import isEqual from "lodash/isEqual.js"
import { getField, getLowercaseFields, getSingleFieldRelations } from "@stoker-platform/utils"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auditRelations = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )
    const schema = await fetchCurrentSchema()
    const db = getFirestore()

    for (const [collectionName, collectionSchema] of Object.entries(schema.collections)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const collectionData: Record<string, Record<string, any>> = {}
        console.log(`Loading ${collectionName}...`)
        const collectionSnapshot = await db.collectionGroup(collectionName).get()
        console.log(`Auditing ${collectionName}...`)
        collectionSnapshot.forEach((doc) => {
            collectionData[doc.id] = doc.data()
        })
        const singleFieldRelations = getSingleFieldRelations(collectionSchema, collectionSchema.fields)
        const singleFieldRelationNames = Array.from(singleFieldRelations).map((field) => field.name)
        for (const doc of collectionSnapshot.docs) {
            const record = doc.data() as StokerRecord
            for (const field of collectionSchema.fields) {
                if ("collection" in field) {
                    field.includeFields ||= []
                    field.includeFields.push("Collection_Path")
                    field.includeFields.push("deleted")
                    const relationCollection = schema.collections[field.collection]
                    if (record[field.name]) {
                        for (const relationRecord of Object.entries(record[field.name])) {
                            const [id, relation] = relationRecord
                            const mainRelation = relation as StokerRelation
                            const ref: CollectionReference = getFirestorePathRef(
                                db,
                                mainRelation.Collection_Path,
                                options.tenant,
                            )
                            const sourceRef = await ref.doc(id).get()
                            const source = sourceRef.data() as StokerRecord
                            if (!source) {
                                if (field.preserve) {
                                    for (const includeField of field.includeFields) {
                                        const includeFieldsSchema: CollectionField[] = []
                                        field.includeFields.forEach((includeField) => {
                                            if (includeField !== "Collection_Path" && includeField !== "deleted") {
                                                const field = getField(relationCollection.fields, includeField)
                                                includeFieldsSchema.push(field)
                                            }
                                        })
                                        const relationLowercaseFields = getLowercaseFields(
                                            relationCollection,
                                            includeFieldsSchema,
                                        )
                                        const fieldsToRemove = Object.keys(mainRelation).filter(
                                            (key) =>
                                                !field.includeFields?.includes(key) &&
                                                !(
                                                    key.endsWith("_Lowercase") &&
                                                    Array.from(relationLowercaseFields)
                                                        .map((field) => field.name)
                                                        .includes(key.replace("_Lowercase", ""))
                                                ),
                                        )
                                        if (includeField === "deleted" && !mainRelation.deleted) {
                                            console.log(
                                                `${collectionName} ${doc.id} - Relation ${id} in field ${field.name} does not have "deleted" property`,
                                            )
                                        }
                                        if (
                                            includeField !== "deleted" &&
                                            Array.from(relationLowercaseFields)
                                                .map((field) => field.name)
                                                .includes(includeField)
                                        ) {
                                            if (
                                                mainRelation[`${includeField}_Lowercase`] !==
                                                // eslint-disable-next-line security/detect-object-injection
                                                mainRelation[includeField]?.toLowerCase()
                                            ) {
                                                console.log(
                                                    // eslint-disable-next-line security/detect-object-injection
                                                    `${collectionName} ${doc.id} - Field ${field.name} ${includeField}_Lowercase ${mainRelation[`${includeField}_Lowercase`]} !== ${mainRelation[includeField]?.toLowerCase()}`,
                                                )
                                            }
                                        }
                                        for (const removeField of fieldsToRemove) {
                                            console.log(
                                                // eslint-disable-next-line security/detect-object-injection
                                                `${collectionName} ${doc.id} - Field ${field.name} ${removeField} is not in include fields`,
                                            )
                                        }
                                    }
                                    continue
                                } else {
                                    console.log(
                                        `${collectionName} ${doc.id} - Source record at ${mainRelation.Collection_Path.join("/")}/${id} not found`,
                                    )
                                    continue
                                }
                            }
                            if (field.twoWay) {
                                const sourceField = relationCollection.fields.find(
                                    (sourceField) => sourceField.name === field.twoWay,
                                )
                                if (!sourceField) {
                                    console.log(
                                        `${collectionName} ${doc.id} - Two way field ${field.twoWay} not found in source collection`,
                                    )
                                    continue
                                }
                                // eslint-disable-next-line security/detect-object-injection
                                const sourceRelation = source?.[sourceField.name]?.[doc.id]
                                if (
                                    !(
                                        (sourceRelation &&
                                            (source?.[`${sourceField.name}_Array`] || []).includes(doc.id) &&
                                            (record?.[`${field.name}_Array`] || []).includes(id)) ||
                                        ("preserve" in sourceField &&
                                            sourceField.preserve &&
                                            sourceRelation?.deleted &&
                                            (source?.[`${sourceField.name}_Array`] || []).includes(doc.id))
                                    )
                                ) {
                                    console.log(
                                        `${collectionName} ${doc.id} - Invalid two way relation ${field.name} ${id} found in record ${id} in source collection ${field.collection}`,
                                    )
                                    continue
                                }
                            }
                            if (!record[`${field.name}_Array`]?.includes(id)) {
                                console.log(
                                    `${collectionName} ${doc.id} - Field ${field.name} ${id} not found in ${field.name}_Array`,
                                )
                                continue
                            }
                            if (singleFieldRelationNames.includes(field.name)) {
                                if (!isEqual(record[`${field.name}_Single`], mainRelation)) {
                                    console.log(
                                        `${collectionName} ${doc.id} - Field ${field.name} does not have a single relation`,
                                    )
                                    continue
                                }
                            }
                            for (const includeField of field.includeFields) {
                                const relationCollection = schema.collections[field.collection]
                                let lowercaseFields: Set<CollectionField> = new Set()
                                if (includeField !== "Collection_Path" && includeField !== "deleted") {
                                    const includeFieldSchema = getField(relationCollection.fields, includeField)
                                    lowercaseFields = getLowercaseFields(relationCollection, [includeFieldSchema])
                                }
                                if (includeField !== "deleted") {
                                    // eslint-disable-next-line security/detect-object-injection
                                    if (!isEqual(mainRelation[includeField], source[includeField])) {
                                        console.log(
                                            // eslint-disable-next-line security/detect-object-injection
                                            `${collectionName} ${doc.id} - Field ${field.name} ${includeField} ${mainRelation[includeField]} !== ${source[includeField]}`,
                                        )
                                    }
                                    if (lowercaseFields.size === 1) {
                                        if (
                                            !isEqual(
                                                mainRelation[`${includeField}_Lowercase`],
                                                source[`${includeField}_Lowercase`],
                                            )
                                        ) {
                                            console.log(
                                                // eslint-disable-next-line security/detect-object-injection
                                                `${collectionName} ${doc.id} - Field ${field.name} ${includeField}_Lowercase ${mainRelation[`${includeField}_Lowercase`]} !== ${source[`${includeField}_Lowercase`]}`,
                                            )
                                        }
                                    }
                                    if (singleFieldRelationNames.includes(field.name)) {
                                        if (
                                            !isEqual(
                                                // eslint-disable-next-line security/detect-object-injection
                                                record[`${field.name}_Single`]?.[includeField],
                                                // eslint-disable-next-line security/detect-object-injection
                                                source[includeField],
                                            )
                                        ) {
                                            console.log(
                                                // eslint-disable-next-line security/detect-object-injection
                                                `${collectionName} ${doc.id} - Field ${field.name}_Single ${includeField} ${record[`${field.name}_Single`]?.[includeField]} !== ${source[includeField]}`,
                                            )
                                        }
                                        if (lowercaseFields.size === 1) {
                                            if (
                                                !isEqual(
                                                    record[`${field.name}_Single`]?.[`${includeField}_Lowercase`],
                                                    source[`${includeField}_Lowercase`],
                                                )
                                            ) {
                                                console.log(
                                                    // eslint-disable-next-line security/detect-object-injection
                                                    `${collectionName} ${doc.id} - Field ${field.name}_Single ${includeField}_Lowercase ${record[`${field.name}_Single`]?.[`${includeField}_Lowercase`]} !== ${source[`${includeField}_Lowercase`]}`,
                                                )
                                            }
                                        }
                                    }
                                } else {
                                    if (mainRelation.deleted) {
                                        console.log(
                                            `${collectionName} ${doc.id} - Field ${field.name} has invalid deleted property`,
                                        )
                                    }
                                }
                            }
                            const includeFieldsSchema: CollectionField[] = []
                            field.includeFields.forEach((includeField) => {
                                if (includeField !== "Collection_Path" && includeField !== "deleted") {
                                    const field = getField(relationCollection.fields, includeField)
                                    includeFieldsSchema.push(field)
                                }
                            })
                            const relationLowercaseFields = getLowercaseFields(relationCollection, includeFieldsSchema)
                            const fieldsToRemove = Object.keys(mainRelation).filter(
                                (key) =>
                                    !field.includeFields?.includes(key) &&
                                    !(
                                        key.endsWith("_Lowercase") &&
                                        Array.from(relationLowercaseFields)
                                            .map((field) => field.name)
                                            .includes(key.replace("_Lowercase", ""))
                                    ),
                            )
                            for (const removeField of fieldsToRemove) {
                                console.log(
                                    `${collectionName} ${doc.id} - Field ${field.name} ${removeField} is not in include fields`,
                                )
                            }
                        }
                    }
                }
            }
        }
        console.log(`${collectionName} audited.\n`)
    }

    process.exit()
}

import {
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    RelationField,
    StokerPermissions,
    StokerRecord,
    StokerRelation,
} from "@stoker-platform/types";
import {
    CollectionReference,
    FieldValue,
    Transaction,
    getFirestore,
} from "firebase-admin/firestore";
import {
    Change,
    DocumentSnapshot,
    FirestoreEvent,
} from "firebase-functions/v2/firestore";
import {error as errorLogger, info} from "firebase-functions/logger";
import isEqual from "lodash/isEqual.js";
import {
    dependencyAccess,
    documentAccess,
    getDependencyIndexFields,
    getField,
    getFieldNames,
    getLowercaseFields,
    getRoleGroups,
    getSingleFieldRelations,
    isDependencyField,
} from "@stoker-platform/utils";
import {getFirestorePathRef} from "@stoker-platform/node-client";

/* eslint-disable max-len */

export const validateRelations = (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined,
    Record<string, unknown>>,
    collection: CollectionSchema,
    schema: CollectionsSchema,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const before = snapshot.before.data() as StokerRecord | undefined;
        const after = snapshot.after.data() as StokerRecord | undefined;

        if (!before && after?.Last_Write_By === "System") return;

        const db = getFirestore();

        const {labels, fields} = collection;
        const singleFieldRelations = getSingleFieldRelations(collection, fields);
        const singleFieldRelationsNames = Array.from(singleFieldRelations).map((field) => field.name);

        const detectInvalidTwoWayRelation = (
            operation: "add" | "remove",
            mainField: RelationField,
            sourceField: RelationField,
            mainId: string,
            sourceId: string,
            main: StokerRecord,
            source: StokerRecord,
            deleteOperation?: "preserve" | boolean
        ) => {
            // eslint-disable-next-line security/detect-object-injection
            const mainRelation = main?.[mainField.name]?.[sourceId];
            // eslint-disable-next-line security/detect-object-injection
            const sourceRelation = source?.[sourceField.name]?.[mainId];
            if (operation === "add") {
                return !(sourceRelation && mainRelation);
            }
            if (operation === "remove") {
                if (deleteOperation) {
                    if (deleteOperation === "preserve") {
                        return !sourceRelation.deleted;
                    } else {
                        return sourceRelation;
                    }
                } else {
                    return sourceRelation || mainRelation;
                }
            }
            return;
        };

        const deleteMainRelation = (
            field: RelationField,
            docId: string,
            relationId: string,
            transaction: Transaction,
        ) => {
            transaction.update(snapshot.after.ref, {
                [`${field.name}.${relationId}`]: FieldValue.delete(),
                [`${field.name}_Array`]: FieldValue.arrayRemove(relationId),
                [`${field.name}_Single`]: FieldValue.delete(),
            });
            if (isDependencyField(field, collection, schema)) {
                transaction.update(
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(labels.collection)
                        .collection(`${labels.collection}-${field.name}`)
                        .doc(docId),
                    {
                        [`${field.name}.${relationId}`]: FieldValue.delete(),
                        [`${field.name}_Array`]: FieldValue.arrayRemove(relationId),
                    }
                );
            }
            collection.fields.forEach((collectionField) => {
                if (isDependencyField(collectionField, collection, schema)) {
                    const dependencyIndexFields = JSON.parse(getFieldNames(getDependencyIndexFields(collectionField, collection, schema)));
                    if (dependencyIndexFields.includes(field.name)) {
                        transaction.update(db.
                            collection("tenants")
                            .doc(tenantId)
                            .collection("system_fields")
                            .doc(labels.collection)
                            .collection(`${labels.collection}-${collectionField.name}`)
                            .doc(docId), {
                            [`${field.name}_Array`]: FieldValue.arrayRemove(relationId),
                        });
                    }
                }
            });
            const roleGroups = getRoleGroups(collection, schema);
            roleGroups.forEach((roleGroup) => {
                if (roleGroup.fields.some((groupField) => groupField.name === field.name)) {
                    transaction.update(
                        db
                            .collection("tenants")
                            .doc(tenantId)
                            .collection("system_fields")
                            .doc(labels.collection)
                            .collection(`${labels.collection}-${roleGroup.key}`)
                            .doc(docId), {
                            [`${field.name}.${relationId}`]: FieldValue.delete(),
                            [`${field.name}_Array`]: FieldValue.arrayRemove(relationId),
                            [`${field.name}_Single`]: FieldValue.delete(),
                        });
                }
            });
        };

        const deleteSourceRelation = (
            ref: CollectionReference,
            sourceSchema: CollectionSchema,
            field: RelationField,
            docId: string,
            relationId: string,
            transaction: Transaction,
            preserve?: boolean,
        ) => {
            if (!preserve) {
                transaction.update(ref.doc(docId), {
                    [`${field.name}.${relationId}`]: FieldValue.delete(),
                    [`${field.name}_Array`]: FieldValue.arrayRemove(relationId),
                    [`${field.name}_Single`]: FieldValue.delete(),
                });
                if (isDependencyField(field, sourceSchema, schema)) {
                    transaction.update(
                        db
                            .collection("tenants")
                            .doc(tenantId)
                            .collection("system_fields")
                            .doc(sourceSchema.labels.collection)
                            .collection(`${sourceSchema.labels.collection}-${field.name}`)
                            .doc(docId),
                        {
                            [`${field.name}.${relationId}`]: FieldValue.delete(),
                            [`${field.name}_Array`]: FieldValue.arrayRemove(relationId),
                        }
                    );
                }
                sourceSchema.fields.forEach((collectionField) => {
                    if (isDependencyField(collectionField, sourceSchema, schema)) {
                        const sourceDependencyIndexFields = JSON.parse(getFieldNames(getDependencyIndexFields(collectionField, sourceSchema, schema)));
                        if (sourceDependencyIndexFields.includes(field.name)) {
                            transaction.update(
                                db
                                    .collection("tenants")
                                    .doc(tenantId)
                                    .collection("system_fields")
                                    .doc(sourceSchema.labels.collection)
                                    .collection(`${sourceSchema.labels.collection}-${collectionField.name}`)
                                    .doc(docId), {
                                    [`${field.name}_Array`]: FieldValue.arrayRemove(relationId),
                                });
                        }
                    }
                });
                const roleGroups = getRoleGroups(sourceSchema, schema);
                roleGroups.forEach((roleGroup) => {
                    if (roleGroup.fields.includes(field)) {
                        transaction.update(
                            db
                                .collection("tenants")
                                .doc(tenantId)
                                .collection("system_fields")
                                .doc(sourceSchema.labels.collection)
                                .collection(`${sourceSchema.labels.collection}-${roleGroup.key}`)
                                .doc(docId), {
                                [`${field.name}.${relationId}`]: FieldValue.delete(),
                                [`${field.name}_Array`]: FieldValue.arrayRemove(relationId),
                                [`${field.name}_Single`]: FieldValue.delete(),
                            });
                    }
                });
            } else {
                const singleRelationFields = getSingleFieldRelations(sourceSchema, [field]);
                const mainUpdate = {
                    [`${field.name}.${relationId}.deleted`]: true,
                };
                if (singleRelationFields.size === 1) {
                    mainUpdate[`${field.name}_Single.deleted`] = true;
                }
                transaction.update(ref.doc(docId), mainUpdate);
                if (isDependencyField(field, sourceSchema, schema)) {
                    transaction.update(
                        db
                            .collection("tenants")
                            .doc(tenantId)
                            .collection("system_fields")
                            .doc(sourceSchema.labels.collection)
                            .collection(`${sourceSchema.labels.collection}-${field.name}`)
                            .doc(docId),
                        {
                            [`${field.name}.${relationId}.deleted`]: true,
                        }
                    );
                }
                const roleGroups = getRoleGroups(sourceSchema, schema);
                roleGroups.forEach((roleGroup) => {
                    if (roleGroup.fields.includes(field)) {
                        const roleGroupUpdate = {
                            [`${field.name}.${relationId}.deleted`]: true,
                        };
                        if (singleRelationFields.size === 1) {
                            roleGroupUpdate[`${field.name}_Single.deleted`] = true;
                        }
                        transaction.update(db.
                            collection("tenants")
                            .doc(tenantId)
                            .collection("system_fields")
                            .doc(sourceSchema.labels.collection)
                            .collection(`${sourceSchema.labels.collection}-${roleGroup.key}`)
                            .doc(docId), roleGroupUpdate);
                    }
                });
            }
        };

        const correctRelation = async (
            operation: "add" | "remove",
            field: RelationField,
            mainId: string,
            sourceId: string,
            main: StokerRecord,
            ref: CollectionReference,
            source: StokerRecord,
            transaction: Transaction,
            deleteOperation?: "preserve" | boolean,
        ) => {
            const sourceSchema = schema.collections[field.collection];
            const sourceField = getField(sourceSchema.fields, field.twoWay) as RelationField;
            if (!sourceField) errorLogger(`Field ${field.name} in collection ${labels.collection} has a two way relation in ${field.collection} but the target field does not exist.`);
            else if (!sourceField.access) {
                if (detectInvalidTwoWayRelation(operation, field, sourceField, mainId, sourceId, main, source, deleteOperation)) {
                    if (main && !deleteOperation) {
                        deleteMainRelation(field, mainId, sourceId, transaction);
                    }
                    if (source) {
                        deleteSourceRelation(ref, sourceSchema, sourceField, sourceId, mainId, transaction, deleteOperation === "preserve");
                    }
                    return true;
                }
            }
            return false;
        };

        const getSourceDocument = async (collection: CollectionSchema, id: string) => {
            const snapshot = await db.collectionGroup(collection.labels.collection).where("id", "==", id).get().catch();
            if (snapshot.size === 0) return;
            return snapshot.docs[0].data() as StokerRecord;
        };

        const fieldRelationsChanged = (field: RelationField) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            return (!isEqual(before![field.name], after![field.name]) ||
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            !isEqual(before![`${field.name}_Array`], after![`${field.name}_Array`])) ||
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            (singleFieldRelationsNames.includes(field.name) && !isEqual(before![`${field.name}_Single`], after![`${field.name}_Single`]));
        };

        let relationsChanged = !before;
        if (before && after) {
            fields.forEach((field) => {
                if ("collection" in field && fieldRelationsChanged(field)) {
                    relationsChanged = true;
                }
            });
        }

        for (const field of fields) {
            if (after && relationsChanged) {
                if ("collection" in field && (!before || fieldRelationsChanged(field))) {
                    const relationCollection = schema.collections[field.collection];
                    const includeFields = field.includeFields || [];
                    includeFields.push("Collection_Path");
                    includeFields.push("deleted");
                    if (after[field.name]) {
                        for (const relationRecord of Object.entries(after[field.name])) {
                            const [id, relation] = relationRecord;
                            // eslint-disable-next-line security/detect-object-injection
                            if (!before || !isEqual(relation, before[field.name]?.[id])) {
                                await db.runTransaction(async (transaction) => {
                                    const mainRef = await transaction.get(snapshot.after.ref);
                                    if (!mainRef.exists) return;
                                    const main = mainRef.data() as StokerRecord;
                                    // eslint-disable-next-line security/detect-object-injection
                                    const mainRelation: StokerRelation | undefined = main[field.name]?.[id];
                                    if (!mainRelation) return;
                                    let collectionPath: string[] | undefined;
                                    const sourceDoc = await getSourceDocument(relationCollection, id);
                                    if (!sourceDoc) {
                                        if (!field.preserve) {
                                            deleteMainRelation(field, snapshot.after.id, id, transaction);
                                            info(`No source found for relation ${field.name} ${id} in collection ${labels.collection} for record ${snapshot.after.id}.`);
                                            return;
                                        }
                                    } else {
                                        collectionPath = sourceDoc.Collection_Path;
                                    }
                                    if (!collectionPath) return;
                                    const ref = getFirestorePathRef(db, collectionPath, tenantId) as CollectionReference;
                                    const sourceRef = await transaction.get(ref.doc(id));
                                    const source = sourceRef.data() as StokerRecord | undefined;
                                    if (!source && !field.preserve) {
                                        deleteMainRelation(field, snapshot.after.id, id, transaction);
                                        info(`No source found for relation ${field.name} ${id} in collection ${labels.collection} for record ${snapshot.after.id}.`);
                                        return;
                                    }
                                    // eslint-disable-next-line security/detect-object-injection
                                    if (!before?.[field.name]?.[id] && after.Last_Write_By !== "System" && source && ref && !field.writeAny) {
                                        const permissions = await transaction.get(db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(after.Last_Write_By));
                                        if (!permissions.exists || !(documentAccess("Read", relationCollection, schema, after.Last_Write_By, permissions.data() as StokerPermissions, source) || dependencyAccess(relationCollection, schema, after.Last_Write_By, permissions.data() as StokerPermissions, source))) {
                                            deleteMainRelation(field, snapshot.after.id, id, transaction);
                                            if (field.twoWay) {
                                                const sourceField = getField(relationCollection.fields, field.twoWay) as RelationField;
                                                deleteSourceRelation(ref, relationCollection, sourceField, id, snapshot.after.id, transaction);
                                            }
                                            info(`User ${after.Last_Write_By} does not have access to source document ${id} in collection ${relationCollection.labels.collection}.`);
                                            return;
                                        }
                                    }
                                    // eslint-disable-next-line security/detect-object-injection
                                    if (!before?.[field.name]?.[id] && field.twoWay && source && ref) {
                                        const invalid = await correctRelation("add", field, snapshot.after.id, id, main, ref, source, transaction);
                                        if (invalid) {
                                            info(`Two way relation between ${field.name} ${id} and ${field.twoWay} ${snapshot.after.id} for record ${snapshot.after.id} in collection ${labels.collection} was invalid.`);
                                            return;
                                        }
                                    }
                                    for (const includeField of includeFields) {
                                        let lowercaseFields: Set<CollectionField> = new Set();
                                        if (includeField !== "Collection_Path" && includeField !== "deleted") {
                                            const includeFieldSchema = getField(relationCollection.fields, includeField);
                                            lowercaseFields = getLowercaseFields(relationCollection, [includeFieldSchema]);
                                        }
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        const fieldUpdate: { [key: string]: any } = {};
                                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                        let fieldUpdateWithSingle: { [key: string]: any } = {};
                                        // eslint-disable-next-line security/detect-object-injection
                                        if (source && includeField !== "deleted" && (!isEqual(mainRelation[includeField], source[includeField]) ||
                                            (lowercaseFields.size === 1 && !isEqual(mainRelation[`${includeField}_Lowercase`], source[`${includeField}_Lowercase`])))) {
                                            // eslint-disable-next-line security/detect-object-injection
                                            fieldUpdate[`${field.name}.${id}.${includeField}`] = source[includeField] ?? FieldValue.delete();
                                            if (lowercaseFields.size === 1) {
                                                fieldUpdate[`${field.name}.${id}.${includeField}_Lowercase`] = source[`${includeField}_Lowercase`] ?? FieldValue.delete();
                                            }
                                            fieldUpdateWithSingle = {...fieldUpdate};
                                            if (singleFieldRelationsNames.includes(field.name)) {
                                                // eslint-disable-next-line security/detect-object-injection
                                                fieldUpdateWithSingle[`${field.name}_Single.${includeField}`] = source[includeField] ?? FieldValue.delete();
                                                if (lowercaseFields.size === 1) {
                                                    fieldUpdateWithSingle[`${field.name}_Single.${includeField}_Lowercase`] = source[`${includeField}_Lowercase`] ?? FieldValue.delete();
                                                }
                                            }
                                        }
                                        if (source && includeField === "deleted" && mainRelation.deleted) {
                                            fieldUpdate[`${field.name}.${id}.deleted`] = FieldValue.delete();
                                            fieldUpdateWithSingle[`${field.name}.${id}.deleted`] = FieldValue.delete();
                                            fieldUpdateWithSingle[`${field.name}_Single.deleted`] = FieldValue.delete();
                                        }
                                        const includeFieldsSchema: CollectionField[] = [];
                                        includeFields.forEach((includeField) => {
                                            if (includeField !== "Collection_Path" && includeField !== "deleted") {
                                                const field = getField(relationCollection.fields, includeField);
                                                includeFieldsSchema.push(field);
                                            }
                                        });
                                        const relationLowercaseFields = getLowercaseFields(relationCollection, includeFieldsSchema);
                                        if (!source && field.preserve) {
                                            if (includeField === "deleted" && !mainRelation.deleted) {
                                                fieldUpdate[`${field.name}.${id}.deleted`] = true;
                                                fieldUpdateWithSingle[`${field.name}.${id}.deleted`] = true;
                                                if (singleFieldRelationsNames.includes(field.name)) {
                                                    fieldUpdateWithSingle[`${field.name}_Single.deleted`] = true;
                                                }
                                            }
                                            if (includeField !== "deleted" && Array.from(relationLowercaseFields).map((field) => field.name).includes(includeField)) {
                                                // eslint-disable-next-line security/detect-object-injection
                                                if (mainRelation[`${includeField}_Lowercase`] !== mainRelation[includeField]?.toLowerCase()) {
                                                    // eslint-disable-next-line security/detect-object-injection
                                                    fieldUpdate[`${field.name}.${id}.${includeField}_Lowercase`] = mainRelation[includeField]?.toLowerCase() ?? FieldValue.delete();
                                                    // eslint-disable-next-line security/detect-object-injection
                                                    fieldUpdateWithSingle[`${field.name}.${id}.${includeField}_Lowercase`] = mainRelation[includeField]?.toLowerCase() ?? FieldValue.delete();
                                                    if (singleFieldRelationsNames.includes(field.name)) {
                                                        // eslint-disable-next-line security/detect-object-injection
                                                        fieldUpdateWithSingle[`${field.name}_Single.${includeField}_Lowercase`] = mainRelation[includeField]?.toLowerCase() ?? FieldValue.delete();
                                                    }
                                                }
                                            }
                                        }
                                        const fieldsToRemove = Object.keys(mainRelation).filter((key) =>
                                            !includeFields.includes(key) &&
                                            !(key.endsWith("_Lowercase") && Array.from(relationLowercaseFields).map((field) => field.name).includes(key.replace("_Lowercase", "")))
                                        );
                                        for (const removeField of fieldsToRemove) {
                                            fieldUpdate[`${field.name}.${id}.${removeField}`] = FieldValue.delete();
                                            fieldUpdateWithSingle[`${field.name}.${id}.${removeField}`] = FieldValue.delete();
                                            if (singleFieldRelationsNames.includes(field.name)) {
                                                fieldUpdateWithSingle[`${field.name}_Single.${removeField}`] = FieldValue.delete();
                                            }
                                        }
                                        if (Object.keys(fieldUpdateWithSingle).length > 0) {
                                            transaction.update(snapshot.after.ref, fieldUpdateWithSingle);
                                        }
                                        if (Object.keys(fieldUpdate).length > 0) {
                                            if (isDependencyField(field, collection, schema)) {
                                                transaction.update(
                                                    db
                                                        .collection("tenants")
                                                        .doc(tenantId)
                                                        .collection("system_fields")
                                                        .doc(labels.collection)
                                                        .collection(`${labels.collection}-${field.name}`)
                                                        .doc(snapshot.after.id),
                                                    fieldUpdate,
                                                );
                                            }
                                        }
                                        if (Object.keys(fieldUpdateWithSingle).length > 0) {
                                            const roleGroups = getRoleGroups(collection, schema);
                                            roleGroups.forEach((roleGroup) => {
                                                if (roleGroup.fields.some((groupField) => groupField.name === field.name)) {
                                                    transaction.update(
                                                        db
                                                            .collection("tenants")
                                                            .doc(tenantId)
                                                            .collection("system_fields")
                                                            .doc(labels.collection)
                                                            .collection(`${labels.collection}-${roleGroup.key}`)
                                                            .doc(snapshot.after.id),
                                                        fieldUpdateWithSingle,
                                                    );
                                                }
                                            });
                                        }
                                    }
                                }, {maxAttempts: 30}).catch((error) => {
                                    errorLogger(error);
                                });
                            }
                        }
                    }
                    if (before && field.twoWay) {
                        if (before[field.name]) {
                            for (const [id, relation] of Object.entries(before[field.name])) {
                                // eslint-disable-next-line security/detect-object-injection
                                if (!after[field.name]?.[id]) {
                                    await db.runTransaction(async (transaction) => {
                                        const sourceDoc = await getSourceDocument(relationCollection, id);
                                        if (!sourceDoc) {
                                            info(`No source found for relation ${field.name} ${id} in collection ${labels.collection} for record ${snapshot.after.id}.`);
                                            return;
                                        } else {
                                            (relation as StokerRelation).Collection_Path = sourceDoc?.Collection_Path;
                                        }
                                        const ref = getFirestorePathRef(db, (relation as StokerRelation).Collection_Path, tenantId) as CollectionReference;
                                        const sourceRef = await transaction.get(ref.doc(id));
                                        const source = sourceRef.data() as StokerRecord;
                                        if (!source) {
                                            info(`No source found for relation ${field.name} ${id} in collection ${labels.collection} for record ${snapshot.after.id}.`);
                                            return;
                                        }
                                        const mainRef = await transaction.get(snapshot.after.ref);
                                        const main = mainRef.data() as StokerRecord;
                                        const invalid = await correctRelation("remove", field, snapshot.after.id, id, main, ref, source, transaction);
                                        if (invalid) {
                                            info(`Two way relation between ${field.name} ${id} and ${field.twoWay} ${snapshot.after.id} for record ${snapshot.after.id} in collection ${labels.collection} was invalid.`);
                                        }
                                    }, {maxAttempts: 30}).catch((error) => {
                                        errorLogger(error);
                                    });
                                }
                            }
                        }
                    }
                }
            } else if (!after && before) {
                if ("collection" in field && field.twoWay) {
                    const relationCollection = schema.collections[field.collection];
                    if (before[field.name]) {
                        for (const [id, relation] of Object.entries(before[field.name])) {
                            await db.runTransaction(async (transaction) => {
                                const sourceDoc = await getSourceDocument(relationCollection, id);
                                if (!sourceDoc) {
                                    info(`No source found for relation ${field.name} ${id} in collection ${labels.collection} for record ${snapshot.after.id}.`);
                                    return;
                                } else {
                                    (relation as StokerRelation).Collection_Path = sourceDoc?.Collection_Path;
                                }
                                const ref = getFirestorePathRef(db, (relation as StokerRelation).Collection_Path, tenantId) as CollectionReference;
                                const sourceRef = await transaction.get(ref.doc(id));
                                const source = sourceRef.data() as StokerRecord;
                                if (!source) {
                                    info(`No source found for relation ${field.name} ${id} in collection ${labels.collection} for record ${snapshot.after.id}.`);
                                    return;
                                }
                                const targetField = getField(relationCollection.fields, field.twoWay) as RelationField;
                                if (!targetField) errorLogger(`Field ${field.name} in collection ${labels.collection} has a two way relation in ${field.collection} but the target field does not exist.`);
                                const invalid = await correctRelation("remove", field, snapshot.after.id, id, before, ref, source, transaction, targetField.preserve ? "preserve" : true);
                                if (invalid) {
                                    info(`Two way relation between ${field.name} ${id} and ${field.twoWay} ${snapshot.after.id} for record ${snapshot.after.id} in collection ${labels.collection} was invalid.`);
                                }
                            }, {maxAttempts: 30}).catch((error) => {
                                errorLogger(error);
                            });
                        }
                    }
                }
            }
        }
        return;
    })();
};

import {
    CollectionsSchema,
    CollectionSchema,
    RelationField,
} from "@stoker-platform/types";
import {
    getDependencyIndexFields,
    getField,
    getFieldNames,
    getRoleGroups,
    getSingleFieldRelations,
    isDependencyField,
    isRelationField,
} from "@stoker-platform/utils";
import {
    FieldValue,
    getFirestore,
    QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    FirestoreEvent,
} from "firebase-functions/v2/firestore";

/* eslint-disable max-len */

export const removeRelations = (
    event: FirestoreEvent<QueryDocumentSnapshot | undefined, Record<string, string>>,
    collection: CollectionSchema,
    schema: CollectionsSchema,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;

        const db = getFirestore();

        const {labels, access} = collection;

        for (const relatedCollection of Object.values(schema.collections)) {
            const fieldsToUpdate: RelationField[] = [];
            for (const field of relatedCollection.fields) {
                if (!isRelationField(field)) continue;
                if (field.twoWay) continue;
                if (field.collection !== labels.collection) continue;
                fieldsToUpdate.push(field);
            }
            if (fieldsToUpdate.length === 0) continue;
            for (const field of fieldsToUpdate) {
                const singleRelationFields = getSingleFieldRelations(relatedCollection, [field]);

                let records;
                let lastVisible = null;
                const pageSize = 1000;

                do {
                    let query = db.collectionGroup(relatedCollection.labels.collection)
                        .where(
                            `${field.name}_Array`,
                            "array-contains",
                            snapshot.id,
                        )
                        .limit(pageSize);

                    if (lastVisible) {
                        query = query.startAfter(lastVisible);
                    }

                    records = await query.get().catch((error) => {
                        errorLogger(`Error getting records for ${relatedCollection.labels.collection} with field ${field.name}`);
                        errorLogger(error);
                    });

                    if (records && !records.empty) {
                        lastVisible = records.docs[records.docs.length - 1];

                        for (const record of records.docs) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const batch = db.batch();
                            if (field.preserve) {
                                const mainUpdate = {
                                    [`${field.name}.${snapshot.id}.deleted`]: true,
                                };
                                if (singleRelationFields.size === 1) {
                                    mainUpdate[`${field.name}_Single.deleted`] = true;
                                }
                                batch.update(record.ref, mainUpdate);
                                if (isDependencyField(field, relatedCollection, schema)) {
                                    batch.update(
                                        db
                                            .collection("tenants")
                                            .doc(tenantId)
                                            .collection("system_fields")
                                            .doc(relatedCollection.labels.collection)
                                            .collection(`${relatedCollection.labels.collection}-${field.name}`)
                                            .doc(record.id),
                                        {
                                            [`${field.name}.${snapshot.id}.deleted`]: true,
                                        }
                                    );
                                }
                                const roleGroups = getRoleGroups(relatedCollection, schema);
                                roleGroups.forEach((roleGroup) => {
                                    if (roleGroup.fields.includes(field)) {
                                        const roleGroupUpdate = {
                                            [`${field.name}.${snapshot.id}.deleted`]: true,
                                        };
                                        if (singleRelationFields.size === 1) {
                                            roleGroupUpdate[`${field.name}_Single.deleted`] = true;
                                        }
                                        batch.update(
                                            db
                                                .collection("tenants")
                                                .doc(tenantId)
                                                .collection("system_fields")
                                                .doc(relatedCollection.labels.collection)
                                                .collection(`${relatedCollection.labels.collection}-${roleGroup.key}`)
                                                .doc(record.id),
                                            roleGroupUpdate);
                                    }
                                });
                            } else {
                                batch.update(record.ref, {
                                    [`${field.name}.${snapshot.id}`]: FieldValue.delete(),
                                    [`${field.name}_Array`]: FieldValue.arrayRemove(snapshot.id),
                                    [`${field.name}_Single`]: FieldValue.delete(),
                                });
                                if (isDependencyField(field, relatedCollection, schema)) {
                                    batch.update(
                                        db
                                            .collection("tenants")
                                            .doc(tenantId)
                                            .collection("system_fields")
                                            .doc(relatedCollection.labels.collection)
                                            .collection(`${relatedCollection.labels.collection}-${field.name}`)
                                            .doc(record.id),
                                        {
                                            [`${field.name}.${snapshot.id}`]: FieldValue.delete(),
                                            [`${field.name}_Array`]: FieldValue.arrayRemove(snapshot.id),
                                        }
                                    );
                                }
                                relatedCollection.fields.forEach((collectionField) => {
                                    if (isDependencyField(collectionField, relatedCollection, schema)) {
                                        const sourceDependencyIndexFields = JSON.parse(getFieldNames(getDependencyIndexFields(collectionField, relatedCollection, schema)));
                                        if (sourceDependencyIndexFields.includes(field.name)) {
                                            batch.update(
                                                db
                                                    .collection("tenants")
                                                    .doc(tenantId)
                                                    .collection("system_fields")
                                                    .doc(relatedCollection.labels.collection)
                                                    .collection(`${relatedCollection.labels.collection}-${collectionField.name}`)
                                                    .doc(record.id), {
                                                    [`${field.name}_Array`]: FieldValue.arrayRemove(snapshot.id),
                                                });
                                        }
                                    }
                                });
                                const roleGroups = getRoleGroups(relatedCollection, schema);
                                roleGroups.forEach((roleGroup) => {
                                    if (roleGroup.fields.includes(field)) {
                                        batch.update(
                                            db
                                                .collection("tenants")
                                                .doc(tenantId)
                                                .collection("system_fields")
                                                .doc(relatedCollection.labels.collection)
                                                .collection(`${relatedCollection.labels.collection}-${roleGroup.key}`)
                                                .doc(record.id), {
                                                [`${field.name}.${snapshot.id}`]: FieldValue.delete(),
                                                [`${field.name}_Array`]: FieldValue.arrayRemove(snapshot.id),
                                                [`${field.name}_Single`]: FieldValue.delete(),
                                            });
                                    }
                                });
                            }
                            await batch.commit();
                        }
                    }
                } while (records && !records.empty);
            }

            if (relatedCollection.access.entityRestrictions) {
                const entityRestrictions = relatedCollection.access.entityRestrictions.restrictions;
                if (!entityRestrictions) continue;
                for (const restriction of entityRestrictions) {
                    if (restriction.type !== "Parent" && restriction.type !== "Parent_Property") continue;
                    const collectionField = getField(relatedCollection.fields, restriction.collectionField) as RelationField;
                    if (!collectionField) continue;
                    if (collectionField.collection !== labels.collection) continue;
                    if (restriction.type === "Parent") {
                        let records;
                        let lastVisible = null;
                        const pageSize = 1000;

                        do {
                            let query = db.collection("tenants").doc(tenantId).collection("system_user_permissions")
                                .where(
                                    `collections.${relatedCollection.labels.collection}.parentEntities`,
                                    "array-contains",
                                    snapshot.id,
                                )
                                .limit(pageSize);

                            if (lastVisible) {
                                query = query.startAfter(lastVisible);
                            }

                            records = await query.get().catch((error) => {
                                errorLogger(error);
                            });

                            if (records && !records.empty) {
                                lastVisible = records.docs[records.docs.length - 1];

                                for (const record of records.docs) {
                                    const batch = db.batch();
                                    batch.update(record.ref, {
                                        [`collections.${relatedCollection.labels.collection}.parentEntities`]: FieldValue.arrayRemove(snapshot.id),
                                    });
                                    await batch.commit();
                                }
                            }
                        } while (records && !records.empty);
                    } else if (restriction.type === "Parent_Property") {
                        const propertyField = getField(relatedCollection.fields, restriction.propertyField);
                        if (!propertyField || !("values" in propertyField && propertyField.values)) continue;
                        for (const value of propertyField.values) {
                            let records;
                            let lastVisible = null;
                            const pageSize = 1000;

                            do {
                                let query = db.collection("tenants").doc(tenantId).collection("system_user_permissions")
                                    .where(
                                        `collections.${relatedCollection.labels.collection}.parentEntities.${value}`,
                                        "array-contains",
                                        snapshot.id,
                                    )
                                    .limit(pageSize);

                                if (lastVisible) {
                                    query = query.startAfter(lastVisible);
                                }

                                records = await query.get().catch((error) => {
                                    errorLogger(error);
                                });

                                if (records && !records.empty) {
                                    lastVisible = records.docs[records.docs.length - 1];

                                    for (const record of records.docs) {
                                        const batch = db.batch();
                                        batch.update(record.ref, {
                                            [`collections.${relatedCollection.labels.collection}.parentEntities.${value}`]: FieldValue.arrayRemove(snapshot.id),
                                        });
                                        await batch.commit();
                                    }
                                }
                            } while (records && !records.empty);
                        }
                    }
                }
            }
        }
        if (access.entityRestrictions) {
            const entityRestrictions = access.entityRestrictions.restrictions;
            if (!entityRestrictions) return;
            for (const restriction of entityRestrictions) {
                if (restriction.type === "Individual") {
                    let records;
                    let lastVisible = null;
                    const pageSize = 1000;

                    do {
                        let query = db.collection("tenants").doc(tenantId).collection("system_user_permissions")
                            .where(
                                `collections.${labels.collection}.individualEntities`,
                                "array-contains",
                                snapshot.id,
                            )
                            .limit(pageSize);

                        if (lastVisible) {
                            query = query.startAfter(lastVisible);
                        }

                        records = await query.get().catch((error) => {
                            errorLogger(error);
                        });

                        if (records && !records.empty) {
                            lastVisible = records.docs[records.docs.length - 1];

                            for (const record of records.docs) {
                                const batch = db.batch();
                                batch.update(record.ref, {
                                    [`collections.${labels.collection}.individualEntities`]: FieldValue.arrayRemove(snapshot.id),
                                });
                                await batch.commit();
                            }
                        }
                    } while (records && !records.empty);
                }
            }
        }
        return;
    })();
};

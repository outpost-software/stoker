import {
    CollectionSchema,
    CollectionsSchema,
    StokerRecord,
} from "@stoker-platform/types";
import {
    DocumentData,
    DocumentSnapshot,
    FieldValue,
    getFirestore,
} from "firebase-admin/firestore";
import {
    Change,
    FirestoreEvent,
    QueryDocumentSnapshot,
} from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    getField,
    getLowercaseFields,
    getRoleGroups,
    getSingleFieldRelations,
    isDependencyField,
} from "@stoker-platform/utils";
import isEqual from "lodash/isEqual.js";

/* eslint-disable max-len */

const includeFieldsChanged = (
    dependentFields: string[],
    before: DocumentData,
    after: DocumentData
) => {
    let changed = false;
    dependentFields.forEach((dependentField) => {
        // eslint-disable-next-line security/detect-object-injection
        if (!isEqual(before[dependentField], after[dependentField])) {
            changed = true;
        }
    });
    return changed;
};

const allIncludeFieldsChanged = (
    dependentFields: string[],
    before: DocumentData,
    after: DocumentData
) => {
    let changed = true;
    dependentFields.forEach((dependentField) => {
        // eslint-disable-next-line security/detect-object-injection
        if (before[dependentField] === after[dependentField]) {
            changed = false;
        }
    });
    return changed;
};

export const updateIncludeFields = (
    event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined,
        Record<string, unknown>
    >,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        const db = getFirestore();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const before = snapshot.before.data() as StokerRecord;
        const after = snapshot.after.data() as StokerRecord;
        const {labels} = collectionSchema;

        const dependentFields = new Set<string>();
        Object.values(schema.collections).forEach((collection) => {
            collection.fields.forEach((field) => {
                if ("collection" in field &&
                    field.collection === labels.collection &&
                    field.includeFields
                ) {
                    field.includeFields.forEach((includeField) => {
                        dependentFields.add(includeField);
                    });
                }
            });
        });
        if (!dependentFields.size) return;
        if (!includeFieldsChanged(
            Array.from(dependentFields),
            before,
            after
        )) return;

        let cancelled = false;
        snapshot.after.ref.onSnapshot(async (doc: DocumentSnapshot) => {
            if (doc.exists) {
                const data = doc.data();
                cancelled = allIncludeFieldsChanged(
                    Array.from(dependentFields),
                    after,
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    data!
                );
            }
        }, function(error) {
            errorLogger(error);
        });

        for (const collection of Object.values(schema.collections)) {
            const singleFieldRelations = getSingleFieldRelations(collection, collection.fields);
            const singleFieldRelationsNames = Array.from(singleFieldRelations).map((field) => field.name);
            for (const field of collection.fields) {
                if ("collection" in field &&
                    field.collection === labels.collection &&
                    field.includeFields
                ) {
                    if (cancelled) return;
                    let records;
                    let lastVisible = null;
                    const pageSize = 1000;

                    do {
                        let query = db.collectionGroup(collection.labels.collection)
                            .where(
                                `${field.name}_Array`,
                                "array-contains",
                                event.params[`${labels.record}Id`] as string
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
                                const includeFields = field.includeFields;
                                if (cancelled) return;
                                await db.runTransaction(async (transaction) => {
                                    const updateData: Record<string, FieldValue> = {};
                                    let updateDataWithSingle: Record<string, FieldValue> = {};
                                    const mainRef = await transaction.get(snapshot.after.ref);
                                    const dataRef = await transaction.get(record.ref);
                                    if (dataRef.exists) {
                                        const main = mainRef.data();
                                        const data = dataRef.data();
                                        if (allIncludeFieldsChanged(
                                            includeFields,
                                            after,
                                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                            main!
                                        )) return;
                                        includeFields.forEach((includeField) => {
                                            // eslint-disable-next-line security/detect-object-injection
                                            if (data?.[field.name]?.[snapshot.after.id]?.[includeField] !== undefined &&
                                                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                                !includeFieldsChanged([includeField], after, main!)) {
                                                const relationCollection = schema.collections[field.collection];
                                                const includeFieldSchema = getField(relationCollection.fields, includeField);
                                                const lowercaseFields = getLowercaseFields(relationCollection, [includeFieldSchema]);
                                                updateData[
                                                    `${field.name}.${snapshot.after.id}.${includeField}`
                                                    // eslint-disable-next-line security/detect-object-injection
                                                ] = after[includeField];
                                                if (lowercaseFields.size === 1) {
                                                    updateData[
                                                        `${field.name}.${snapshot.after.id}.${includeField}_Lowercase`
                                                        // eslint-disable-next-line security/detect-object-injection
                                                    ] = after[`${includeField}_Lowercase`];
                                                }
                                                updateDataWithSingle = {...updateData};
                                                if (singleFieldRelationsNames.includes(field.name)) {
                                                    updateDataWithSingle[
                                                        `${field.name}_Single.${includeField}`
                                                        // eslint-disable-next-line security/detect-object-injection
                                                    ] = after[includeField];
                                                    if (lowercaseFields.size === 1) {
                                                        updateDataWithSingle[
                                                            `${field.name}_Single.${includeField}_Lowercase`
                                                            // eslint-disable-next-line security/detect-object-injection
                                                        ] = after[`${includeField}_Lowercase`];
                                                    }
                                                }
                                            }
                                        });
                                        if (Object.keys(updateData).length) {
                                            transaction.update(record.ref, updateDataWithSingle);

                                            if (isDependencyField(field, collection, schema)) {
                                                transaction.update(
                                                    db
                                                        .collection("tenants")
                                                        .doc(tenantId)
                                                        .collection("system_fields")
                                                        .doc(collection.labels.collection)
                                                        .collection(`${collection.labels.collection}-${field.name}`)
                                                        .doc(dataRef.id)
                                                    , updateData
                                                );
                                            }

                                            const roleGroups = getRoleGroups(collection, schema);
                                            roleGroups.forEach((roleGroup) => {
                                                if (roleGroup.fields.some((groupField) => groupField.name === field.name)) {
                                                    transaction.update(
                                                        db
                                                            .collection("tenants")
                                                            .doc(tenantId)
                                                            .collection("system_fields")
                                                            .doc(collection.labels.collection)
                                                            .collection(`${collection.labels.collection}-${roleGroup.key}`)
                                                            .doc(dataRef.id)
                                                        , updateDataWithSingle
                                                    );
                                                }
                                            });
                                        }
                                    } else return;
                                }, {maxAttempts: 10}).catch((error) => {
                                    errorLogger(error);
                                });
                            }
                        }
                    } while (records && !records.empty);
                }
            }
        }
        return;
    })();
};

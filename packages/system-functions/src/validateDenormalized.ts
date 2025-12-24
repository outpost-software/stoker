import {
    CollectionSchema,
    CollectionsSchema,
    StokerRecord,
} from "@stoker-platform/types";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {
    Change,
    DocumentSnapshot,
    FirestoreEvent,
} from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    getDependencyIndexFields,
    getLowercaseFields,
    getRoleGroups,
    getSystemFieldsSchema,
    isDependencyField,
} from "@stoker-platform/utils";
import isEqual from "lodash/isEqual.js";

/* eslint-disable max-len */

export const validateDenormalized = (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined,
    Record<string, unknown>>,
    collection: CollectionSchema,
    schema: CollectionsSchema,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        const db = getFirestore();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const before = snapshot.before.data() as StokerRecord | undefined;
        const after = snapshot.after.data() as StokerRecord | undefined;
        const {labels, fields} = collection;
        const systemFieldsSchema = getSystemFieldsSchema();

        if (!before || !after) {
            return;
        }
        if (before.Last_Write_At.valueOf() !== after.Last_Write_At.valueOf()) {
            return;
        }

        const changedFields = fields.concat(systemFieldsSchema).filter(
            (field) => !isEqual(after[field.name], before[field.name])
        );

        await db.runTransaction(
            async (transaction) => {
                const mainRef = await transaction.get(snapshot.after.ref);
                if (!mainRef.exists) {
                    return;
                }
                const record = mainRef.data() as StokerRecord;
                const dependencyUpdates = new Map<string, Record<string, unknown>>();
                const roleGroupUpdates = new Map<string, Record<string, unknown>>();
                const roleGroups = getRoleGroups(collection, schema);

                for (const field of changedFields) {
                    if (isDependencyField(field, collection, schema)) {
                        const subcollection = `${labels.collection}-${field.name}`;
                        const existing = dependencyUpdates.get(subcollection) || {};
                        dependencyUpdates.set(subcollection, {
                            ...existing,
                            [field.name]: record[field.name] || FieldValue.delete(),
                        });
                    }
                    for (const dependencyField of fields) {
                        if (isDependencyField(dependencyField, collection, schema)) {
                            const dependencyIndexFields = getDependencyIndexFields(dependencyField, collection, schema);
                            if (dependencyIndexFields.some((dependencyIndexField) => dependencyIndexField.name === field.name)) {
                                const subcollection = `${labels.collection}-${field.name}`;
                                const existing = dependencyUpdates.get(subcollection) || {};
                                dependencyUpdates.set(subcollection, {
                                    ...existing,
                                    [field.name]: record[field.name] || FieldValue.delete(),
                                });
                            }
                        }
                    }
                    for (const roleGroup of roleGroups) {
                        if (roleGroup.fields.some((groupField) => groupField.name === field.name)) {
                            const subcollection = `${labels.collection}-${roleGroup.key}`;
                            const existing = roleGroupUpdates.get(subcollection) || {};
                            const update: Record<string, unknown> = {
                                [field.name]: record[field.name] || FieldValue.delete(),
                            };
                            const lowercaseFields = getLowercaseFields(collection, [field]);
                            if (lowercaseFields.size === 1) {
                                update[`${field.name}_Lowercase`] = record[field.name]?.toLowerCase() || FieldValue.delete();
                            }
                            roleGroupUpdates.set(subcollection, {...existing, ...update});
                        }
                    }
                }

                for (const [subcollection, updateData] of dependencyUpdates.entries()) {
                    transaction.update(
                        db
                            .collection("tenants")
                            .doc(tenantId)
                            .collection("system_fields")
                            .doc(labels.collection)
                            .collection(subcollection)
                            .doc(mainRef.id),
                        updateData,
                    );
                }
                for (const [subcollection, updateData] of roleGroupUpdates.entries()) {
                    transaction.update(
                        db
                            .collection("tenants")
                            .doc(tenantId)
                            .collection("system_fields")
                            .doc(labels.collection)
                            .collection(subcollection)
                            .doc(mainRef.id),
                        updateData,
                    );
                }
            },
            {maxAttempts: 10},
        ).catch((error) => {
            errorLogger(error);
        });
        return;
    })();
};

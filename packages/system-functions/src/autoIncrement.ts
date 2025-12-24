import {
    CollectionSchema,
    CollectionsSchema,
    StokerRecord,
} from "@stoker-platform/types";
import {getFirestore} from "firebase-admin/firestore";
import {
    Change,
    DocumentSnapshot,
    FirestoreEvent,
} from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    getDependencyIndexFields,
    getRoleGroups,
    isDependencyField,
} from "@stoker-platform/utils";

/* eslint-disable max-len */

export const autoIncrement = (
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
        const incrementFields = fields.filter(
            (field) => "autoIncrement" in field && field.autoIncrement
        );
        if (after) {
            for (const field of incrementFields) {
                if (after[field.name] === "Pending" || (!before && after.Last_Write_By !== "System")) {
                    await db.runTransaction(
                        async (transaction) => {
                            const mainRef = await transaction.get(snapshot.after.ref);
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            if (mainRef.exists && mainRef.data()![field.name] === "Pending") {
                                const numberDoc = await transaction.get(
                                    db
                                        .collection("tenants")
                                        .doc(tenantId)
                                        .collection("system_auto_increment")
                                        .doc(labels.collection)
                                        .collection("fields")
                                        .doc(field.name),
                                );
                                if (numberDoc.exists) {
                                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                    const newNumber = numberDoc.data()!.number + 1;
                                    transaction.update(
                                        db
                                            .collection("tenants")
                                            .doc(tenantId)
                                            .collection("system_auto_increment")
                                            .doc(labels.collection)
                                            .collection("fields")
                                            .doc(field.name),
                                        {number: newNumber},
                                    );

                                    transaction.update(
                                        snapshot.after.ref,
                                        {[field.name]: newNumber}
                                    );

                                    if (isDependencyField(field, collection, schema)) {
                                        transaction.update(
                                            db
                                                .collection("tenants")
                                                .doc(tenantId)
                                                .collection("system_fields")
                                                .doc(labels.collection)
                                                .collection(`${labels.collection}-${field.name}`)
                                                .doc(mainRef.id),
                                            {[field.name]: newNumber},
                                        );
                                    }
                                    for (const dependencyField of fields) {
                                        if (isDependencyField(dependencyField, collection, schema)) {
                                            const dependencyIndexFields = getDependencyIndexFields(dependencyField, collection, schema);
                                            if (dependencyIndexFields.some((dependencyIndexField) => dependencyIndexField.name === field.name)) {
                                                transaction.update(
                                                    db
                                                        .collection("tenants")
                                                        .doc(tenantId)
                                                        .collection("system_fields")
                                                        .doc(labels.collection)
                                                        .collection(`${labels.collection}-${field.name}`)
                                                        .doc(mainRef.id),
                                                    {[field.name]: newNumber},
                                                );
                                            }
                                        }
                                    }
                                    const roleGroups = getRoleGroups(collection, schema);
                                    for (const roleGroup of roleGroups) {
                                        if (roleGroup.fields.some((groupField) => groupField.name === field.name)) {
                                            transaction.update(
                                                db
                                                    .collection("tenants")
                                                    .doc(tenantId)
                                                    .collection("system_fields")
                                                    .doc(labels.collection)
                                                    .collection(`${labels.collection}-${roleGroup.key}`)
                                                    .doc(mainRef.id),
                                                {[field.name]: newNumber},
                                            );
                                        }
                                    }
                                }
                            }
                        },
                        {maxAttempts: 10},
                    ).catch((error) => {
                        errorLogger(error);
                    });
                }
            }
        }
        return;
    })();
};

import {Change, DocumentSnapshot, FirestoreEvent}
    from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {CollectionSchema, StokerRecord} from "@stoker-platform/types";
import {getFirestore} from "firebase-admin/firestore";

/* eslint-disable max-len */

export const uniqueDelete = (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined,
        Record<string, unknown>>,
    collectionSchema: CollectionSchema,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        const {labels} = collectionSchema;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const before = snapshot.before.data() as StokerRecord | undefined;
        const after = snapshot.after.data() as StokerRecord | undefined;

        if (before) {
            let changedUniqueFields = false;
            for (const field of collectionSchema.fields) {
                if ("unique" in field && field.unique) {
                    if (!after || (before[field.name] !== after[field.name])) {
                        changedUniqueFields = true;
                    }
                }
            }

            if (changedUniqueFields) {
                const db = getFirestore();
                await db.runTransaction(async (transaction) => {
                    let record: StokerRecord;
                    if (after) {
                        const ref = await transaction.get(snapshot.after.ref);
                        record = ref.data() as StokerRecord;
                    }
                    for (const field of collectionSchema.fields) {
                        if ("unique" in field && field.unique) {
                            if (!after || (before[field.name] !== after[field.name])) {
                                const query = db.collection("tenants").doc(tenantId).collection("system_unique").doc(labels.collection).collection(`Unique-${labels.collection}-${field.name}`).where("id", "==", snapshot.before.id);
                                const result = await query.get();
                                result.forEach((doc) => {
                                    if (!after || !record || (doc.exists && doc.id !== record[field.name].toString().toLowerCase().replace(/\s/g, "---").replaceAll("/", "|||"))) {
                                        transaction.delete(doc.ref);
                                    }
                                });
                            }
                        }
                    }
                }, {maxAttempts: 10}).catch((error) => {
                    errorLogger(error);
                });
            }
        }
        return;
    })();
};

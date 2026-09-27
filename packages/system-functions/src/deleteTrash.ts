import {
    deleteRecord,
    getStokerFirestore,
    initializeStoker,
    runWithTenant,
} from "@stoker-platform/node-client";
import {join} from "node:path";
import {
    CollectionSchema,
    StokerRecord,
} from "@stoker-platform/types";
import {
    QueryDocumentSnapshot,
    Timestamp,
} from "firebase-admin/firestore";
import {error as errorLogger} from "firebase-functions/logger";

export const deleteTrash = (
    collection: CollectionSchema,
) => {
    return (async () => {
        const {softDelete} = collection;
        if (!softDelete) return;
        const db = getStokerFirestore();
        let records;
        let lastVisible: QueryDocumentSnapshot | null = null;
        const pageSize = 1000;
        const retentionMs = softDelete.retentionPeriod * 24 * 60 * 60 * 1000;

        await initializeStoker(
            "production",
            undefined,
            join(process.cwd(), "lib", "system-custom", "main.js"),
            join(process.cwd(), "lib", "system-custom", "collections"),
            true,
        );

        const tenants = await db.collection("tenants").listDocuments();

        for (const tenant of tenants) {
            const tenantId = tenant.id;

            await runWithTenant(tenantId, async () => {
                do {
                    let query = db.collectionGroup(collection.labels.collection)
                        .where(
                            softDelete.timestampField,
                            "<=",
                            Timestamp.fromDate(
                                new Date(Date.now() - retentionMs),
                            ),
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

                        for (const doc of records.docs) {
                            if (!doc.ref.path.includes(`tenants/${tenantId}`)) {
                                continue;
                            }
                            const record = doc.data() as StokerRecord;
                            await deleteRecord(
                                record.Collection_Path,
                                record.id,
                                {force: true},
                            );
                        }
                    }
                } while (records && !records.empty);
            });
        }
    })();
};

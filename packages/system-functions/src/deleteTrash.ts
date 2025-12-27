import {
    CollectionSchema,
    StokerRecord,
} from "@stoker-platform/types";
import {
    getFirestore,
    Timestamp,
} from "firebase-admin/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    deleteRecord,
    initializeStoker,
    setTenant,
} from "@stoker-platform/node-client";
import {join} from "node:path";

export const deleteTrash = (
    collection: CollectionSchema,
) => {
    return (async () => {
        const {softDelete} = collection;
        if (!softDelete) return;
        const db = getFirestore();
        let records;
        let lastVisible = null;
        const pageSize = 1000;

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
            setTenant(tenantId);

            do {
                let query = db.collectionGroup(collection.labels.collection)
                    .where(
                        softDelete.timestampField,
                        "<=",
                        Timestamp.fromDate(new Date(Date.now() -
                            softDelete.retentionPeriod * 24 * 60 * 60 * 1000,
                        )),
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
                            undefined,
                            {force: true},
                        );
                    }
                }
            } while (records && !records.empty);
        }
    })();
};

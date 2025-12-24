import {Change, DocumentSnapshot, FirestoreEvent}
    from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    CollectionSchema,
    StokerRecord,
} from "@stoker-platform/types";
import {algoliasearch} from "algoliasearch";
import {
    getFirestorePathRef,
    getOne,
    initializeStoker,
} from "@stoker-platform/node-client";
import {join} from "path";
import {getFirestore} from "firebase-admin/firestore";

/* eslint-disable max-len */

export const fullTextSearch = (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined,
    Record<string, unknown>>,
    collection: CollectionSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algoliaAdminKey: any,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const after = snapshot.after.data() as StokerRecord | undefined;

        const {labels} = collection;

        await initializeStoker(
            "production",
            tenantId,
            join(process.cwd(), "lib", "system-custom", "main.js"),
            join(process.cwd(), "lib", "system-custom", "collections"),
            true
        );

        const db = getFirestore();

        if (!process.env.STOKER_ALGOLIA_ID) {
            errorLogger("Algolia ID environment variable not set");
            return;
        }
        const client = algoliasearch(process.env.STOKER_ALGOLIA_ID, algoliaAdminKey.value());

        if (after) {
            db.runTransaction(async (transaction) => {
                const ref = getFirestorePathRef(db, after.Collection_Path, tenantId);
                await transaction.get(ref.doc(snapshot.after.id));
                const record = await getOne(after.Collection_Path, snapshot.after.id, {noComputedFields: true, noEmbeddingFields: true});
                const recordToSave: StokerRecord = {
                    ...record,
                    tenant_id: tenantId,
                    objectID: record.id,
                };
                await client.saveObject({
                    indexName: labels.collection,
                    body: recordToSave,
                }).catch((error: unknown) => {
                    errorLogger(error);
                });
            });
        } else {
            await client.deleteObject({
                indexName: labels.collection,
                objectID: snapshot.before.id,
            }).catch((error: unknown) => {
                errorLogger(error);
            });
        }
        return;
    })();
};

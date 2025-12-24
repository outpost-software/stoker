import {CollectionSchema} from "@stoker-platform/types";
import {
    FirestoreEvent,
    QueryDocumentSnapshot,
} from "firebase-functions/v2/firestore";
import {getApp} from "firebase-admin/app";
import {getStorage} from "firebase-admin/storage";

export const deleteFiles = (
    event: FirestoreEvent<QueryDocumentSnapshot |
        undefined, Record<string, string>>,
    collection: CollectionSchema,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const path = collection.labels.collection;
        const id = snapshot.id;

        const app = getApp();
        const storage = getStorage();
        const bucket = storage.bucket(app.options.projectId);

        const [files] = await bucket.getFiles({
            prefix: `${tenantId}/${path}/${id}/`,
        });

        await Promise.all(
            files.map((file) => file.delete())
        );
    })();
};

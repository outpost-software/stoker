import {Change, DocumentSnapshot, FirestoreEvent}
    from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    CollectionSchema,
    CollectionsSchema,
    StokerRecord,
} from "@stoker-platform/types";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {vertexAI} from "@genkit-ai/google-genai";
import {genkit} from "genkit";
import {tryPromise} from "@stoker-platform/utils";
import {initializeStoker} from "@stoker-platform/node-client";
import {join} from "path";

/* eslint-disable max-len */

const embedder = vertexAI.embedder("text-embedding-005");

const ai = genkit({
    plugins: [vertexAI({
        location: process.env.FB_AI_REGION || "us-central1",
    })],
});

export const writeEmbedding = (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined,
        Record<string, unknown>>,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        const {labels, ai: aiConfig, softDelete} = collectionSchema;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;

        const after = snapshot.after.data() as StokerRecord | undefined;

        if (after && aiConfig?.embedding) {
            const {getCustomizationFile} = await initializeStoker(
                "production",
                tenantId,
                join(process.cwd(), "lib", "system-custom", "main.js"),
                join(process.cwd(), "lib", "system-custom", "collections"),
                true,
            );
            const customization = getCustomizationFile(labels.collection, schema);
            // eslint-disable-next-line security/detect-object-injection
            const db = getFirestore();
            await db.runTransaction(async (transaction) => {
                if (!aiConfig?.embedding) return;
                const ref = await transaction.get(snapshot.after.ref);
                const record = ref.data() as StokerRecord;
                if (!customization.custom?.setEmbedding) return;
                const input = await tryPromise(customization.custom?.setEmbedding, [record]);
                const embedding = (await ai.embed({
                    embedder,
                    content: input,
                }))[0].embedding;
                const doc: Record<string, unknown> = {
                    input,
                    output: FieldValue.vector(embedding),
                };
                if (softDelete) {
                    doc[softDelete.archivedField] = record[softDelete.archivedField];
                }
                transaction.set(db.collection("tenants").doc(tenantId).collection(`system_embeddings_${labels.collection}`).doc(snapshot.after.id), doc);
            }, {maxAttempts: 20}).catch((error) => {
                errorLogger(error);
            });
        }
        return;
    })();
};

import {Change, DocumentSnapshot, FirestoreEvent}
    from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    CollectionSchema,
    CollectionsSchema,
    StokerRecord,
} from "@stoker-platform/types";
import {FieldValue} from "firebase-admin/firestore";
import {vertexAI} from "@genkit-ai/google-genai";
import {genkit} from "genkit";
import {retryOperation, tryPromise} from "@stoker-platform/utils";
import {
    initializeStoker,
    getStokerFirestore,
    runWithTenant,
} from "@stoker-platform/node-client";
import {join} from "path";

/* eslint-disable max-len */

const embedder = vertexAI.embedder("text-embedding-005");

const ai = genkit({
    plugins: [vertexAI({
        location: process.env.FB_AI_REGION || "global",
    })],
});

export const writeEmbedding = (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined,
        Record<string, unknown>>,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
) => {
    return runWithTenant(event.params.tenantId as string, async () => {
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
            const db = getStokerFirestore();
            const setEmbedding = customization.custom?.setEmbedding;
            if (!setEmbedding) return;
            const embeddingCache = new Map<string, number[]>();

            const embed = (input: string, delay: number, retries: number) => retryOperation(async () => {
                const result = await ai.embed({
                    embedder,
                    content: input,
                });
                embeddingCache.set(input, result[0].embedding);
            }, [], undefined, delay, retries);

            try {
                const initialInput = await tryPromise(setEmbedding, [{record: after}]);
                await embed(initialInput, 1000, 5);
            } catch (error) {
                errorLogger(error);
                return;
            }

            await db.runTransaction(async (transaction) => {
                const ref = await transaction.get(snapshot.after.ref);
                const record = ref.data() as StokerRecord;
                const input = await tryPromise(setEmbedding, [{record}]);
                if (!embeddingCache.has(input)) {
                    await embed(input, 500, 3);
                }
                const doc: Record<string, unknown> = {
                    input,
                    output: FieldValue.vector(embeddingCache.get(input)),
                };
                if (softDelete) {
                    doc[softDelete.archivedField] = record[softDelete.archivedField];
                }
                transaction.set(db.collection("tenants").doc(tenantId).collection(`system_embeddings_${labels.collection}`).doc(snapshot.after.id), doc);
            }, {maxAttempts: 20}).catch((error) => {
                errorLogger(error);
            });
        } else if (!after && aiConfig?.embedding) {
            const db = getStokerFirestore();
            await db.collection("tenants").doc(tenantId)
                .collection(`system_embeddings_${labels.collection}`)
                .doc(snapshot.before.id)
                .delete()
                .catch((error) => {
                    errorLogger(error);
                });
        }
        return;
    });
};

import {vertexAI} from "@genkit-ai/google-genai";
import {CollectionSchema, CollectionsSchema} from "@stoker-platform/types";
import {
    defineFirestoreRetriever,
} from "@genkit-ai/firebase";
import {getFirestore} from "firebase-admin/firestore";
import {AuthData} from "firebase-functions/tasks";
import {z} from "zod";
import {
    addRecord,
    getOne,
    getSome,
    getInputSchema,
    updateRecord,
    initializeStoker,
    deserializeTimestampsWithoutUnderscores,
    tryPromise,
} from "@stoker-platform/node-client";
import {HttpsError} from "firebase-functions/https";
import {Genkit} from "genkit";
import {join} from "node:path";

/* eslint-disable max-len */

const embedder = vertexAI.embedder("text-embedding-005");

export const chatAuthPolicy = (
    auth: AuthData | null,
    collection: CollectionSchema,
) => {
    const user = auth?.uid;
    const token = auth?.token;
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        return false;
    }
    if (!user) {
        return false;
    }
    if (!collection.ai?.chat?.roles.includes(token.role)) {
        return false;
    }
    return true;
};

export const chatFlow = (
    collection: CollectionSchema,
    schema: CollectionsSchema,
    ai: Genkit
) => {
    const {labels, softDelete, ai: aiConfig} = collection;
    if (!aiConfig?.embedding || !aiConfig?.chat) throw new HttpsError("invalid-argument", "Embedding and chat are not enabled for this collection.");
    const {chat} = aiConfig;

    const firestore = getFirestore();

    const zodSchema = getInputSchema(collection, schema, undefined, true);

    const prompt = ai.prompt("chat");

    const retriever = defineFirestoreRetriever(ai, {
        name: `${labels.collection}Retriever`,
        firestore,
        collection: "",
        contentField: "input",
        vectorField: "output",
        embedder,
        distanceMeasure: "COSINE",
    });

    const addRecordTool = ai.defineTool(
        {
            name: `add${labels.collection}`,
            description: `Adds a record to the ${labels.collection} collection`,
            inputSchema: z.object({
                record: zodSchema.describe(`The record to add to the ${labels.collection} collection`),
            }),
            outputSchema: z.string(),
        },
        async (input, {context}) => {
            if (!context.auth) throw new HttpsError("unauthenticated", `You are not authorized to add records to the ${labels.collection} collection.`);
            const tenantId = (context?.auth?.token as {tenant?: string})?.tenant;
            if (!tenantId) {
                throw new HttpsError("unauthenticated", "Tenant ID not found in authentication token");
            }
            await initializeStoker(
                "production",
                tenantId,
                join(process.cwd(), "lib", "system-custom", "main.js"),
                join(process.cwd(), "lib", "system-custom", "collections"),
                true,
            );
            try {
                deserializeTimestampsWithoutUnderscores(input.record);
                const record = await addRecord([labels.collection], input.record, undefined, context.auth?.uid);
                return `Record ${record.id} was successfully added to the ${labels.collection} collection.`;
            } catch {
                return "Error adding record";
            }
        },
    );

    const updateRecordTool = ai.defineTool(
        {
            name: `update${labels.collection}`,
            description: `Updates a record in the ${labels.collection} collection`,
            inputSchema: z.object({
                recordId: z.string().describe(`The id of the record to update in the ${labels.collection} collection`),
                update: zodSchema.describe(`The update to apply to the ${labels.record} record`),
            }),
            outputSchema: z.string(),
        },
        async (input, {context}) => {
            if (!context.auth) throw new HttpsError("unauthenticated", `You are not authorized to update records in the ${labels.collection} collection.`);
            const tenantId = (context?.auth?.token as {tenant?: string})?.tenant;
            if (!tenantId) {
                throw new HttpsError("unauthenticated", "Tenant ID not found in authentication token");
            }
            await initializeStoker(
                "production",
                tenantId,
                join(process.cwd(), "lib", "system-custom", "main.js"),
                join(process.cwd(), "lib", "system-custom", "collections"),
                true,
            );
            try {
                deserializeTimestampsWithoutUnderscores(input.update);
                const record = await updateRecord([labels.collection], input.recordId, input.update, undefined, context.auth?.uid);
                return `Record ${record.id} was successfully updated in the ${labels.collection} collection.`;
            } catch {
                return "Error updating record";
            }
        },
    );

    const getOneTool = ai.defineTool(
        {
            name: `get${labels.record}`,
            description: `Gets a single record from the ${labels.collection} collection`,
            inputSchema: z.object({
                recordId: z.string().describe(`The id of the record to get from the ${labels.collection} collection`),
            }),
            outputSchema: z.string().describe(`The record that was retrieved from the ${labels.collection} collection`),
        },
        async (input, {context}) => {
            if (!context.auth) throw new HttpsError("unauthenticated", `You are not authorized to get records from the ${labels.collection} collection.`);
            const tenantId = (context?.auth?.token as {tenant?: string})?.tenant;
            if (!tenantId) {
                throw new HttpsError("unauthenticated", "Tenant ID not found in authentication token");
            }
            await initializeStoker(
                "production",
                tenantId,
                join(process.cwd(), "lib", "system-custom", "main.js"),
                join(process.cwd(), "lib", "system-custom", "collections"),
                true,
            );
            try {
                const record = await getOne([labels.collection], input.recordId, {user: context.auth?.uid});
                return JSON.stringify(record);
            } catch {
                return "Error getting record";
            }
        },
    );

    const getSomeTool = ai.defineTool(
        {
            name: `get${labels.collection}`,
            description: `Gets multiple records from the ${labels.collection} collection`,
            inputSchema: z.object({}),
            outputSchema: z.string(),
        },
        async (_input, {context}) => {
            if (!context.auth) throw new HttpsError("unauthenticated", `You are not authorized to get records from the ${labels.collection} collection.`);
            const tenantId = (context?.auth?.token as {tenant?: string})?.tenant;
            if (!tenantId) {
                throw new HttpsError("unauthenticated", "Tenant ID not found in authentication token");
            }
            await initializeStoker(
                "production",
                tenantId,
                join(process.cwd(), "lib", "system-custom", "main.js"),
                join(process.cwd(), "lib", "system-custom", "collections"),
                true,
            );
            try {
                const records = await getSome([labels.collection], undefined, {user: context.auth?.uid});
                return JSON.stringify(records.docs);
            } catch {
                return "Error getting records";
            }
        },
    );

    return ai.defineFlow(
        {
            name: `${collection.labels.collection.toLowerCase()}_chat`,
            inputSchema: z.object({
                messages: z.array(z.object({
                    content: z.array(z.object({
                        type: z.literal("text"),
                        text: z.string(),
                    })),
                })),
            }),
        },
        async (input: {messages: {content: {type: "text", text: string}[]}[]}, {sendChunk, context}) => {
            const tenantId = (context?.auth?.token as {tenant?: string})?.tenant;
            if (!tenantId) {
                throw new HttpsError("unauthenticated", "Tenant ID not found in authentication token");
            }
            const where = softDelete ?
                {[softDelete.archivedField]: false} : undefined;

            const docs = await ai.retrieve({
                retriever,
                query: input.messages.map((message) => message.content.map((part) => part.text).join("")).join("\n\n"),
                options: {
                    limit: chat.defaultQueryLimit || 100,
                    where,
                    collection: `tenants/${tenantId}/system_embeddings_${labels.collection}`,
                },
            });

            const {getCustomizationFile} = await initializeStoker(
                "production",
                tenantId,
                join(process.cwd(), "lib", "system-custom", "main.js"),
                join(process.cwd(), "lib", "system-custom", "collections"),
                true,
            );

            const customization = await getCustomizationFile(labels.collection, schema);
            const titles = await tryPromise(customization.admin?.titles);

            const {stream, response} = prompt.stream({
                collection: titles?.collection || labels.collection,
                query: input.messages.map((message) => message.content.map((part) => part.text).join("")).join("\n\n"),
            }, {
                docs,
                tools: [addRecordTool, updateRecordTool, getOneTool, getSomeTool],
            });
            for await (const chunk of stream) {
                sendChunk(chunk.text);
            }
            const finalResponse = await response;
            return finalResponse.text;
        },
    );
};

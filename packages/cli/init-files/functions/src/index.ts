import {initializeApp} from "firebase-admin/app";
import {
    onDocumentCreated,
    onDocumentDeleted,
    onDocumentUpdated,
    onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {onCall, onCallGenkit, HttpsError} from "firebase-functions/v2/https";
import {onUserCreated} from "firebase-functions/v2/identity";
import {requiresRole} from "firebase-functions";
import {
    setGlobalVariables,
    verifyWriteLog,
    autoIncrement,
    updateIncludeFields,
    validateRelations,
    uniqueDelete,
    fullTextSearch,
    readApi,
    validateFields,
    writeApi,
    validateUser,
    getSchema,
    removeRelations,
    chatFlow,
    writeEmbedding,
    chatAuthPolicy,
    deleteTrash,
    searchResults,
    customToken,
    revokeMfa,
    validateDenormalized,
    getFiles,
    deleteFolder,
    messageNotifications,
    deleteFiles,
    sendSMSMessage,
    getWriteLog,
} from "@stoker-platform/system-functions";
import {defineSecret} from "firebase-functions/params";
import {readFileSync} from "fs";
import {
    getPathCollections,
    getFirestoreTriggerDatabase,
    roleHasOperationAccess,
} from "@stoker-platform/utils";
import {
    CollectionSchema,
    CollectionsSchema,
} from "@stoker-platform/types";
import globalConfig from "./system-custom/main.js";
import {genkit} from "genkit";
import {vertexAI} from "@genkit-ai/google-genai";
import {enableFirebaseTelemetry} from "@genkit-ai/firebase";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {sendMail, sendMessage} from "@stoker-platform/node-client";

import * as dotenv from "dotenv";
dotenv.config();

initializeApp();
setGlobalVariables();

const projectDataFile = readFileSync("project-data.json", "utf8");
const projectData = JSON.parse(projectDataFile);
const timeZone: string = projectData.timezone;
const schema: CollectionsSchema = projectData.schema;
const consumeAppCheckToken =
    process.env.FB_FUNCTIONS_CONSUME_APP_CHECK_TOKEN === "true";
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const webAppConfig = JSON.parse(process.env.STOKER_FB_WEB_APP_CONFIG!);
const projectId = webAppConfig.projectId;
const firestoreDatabase =
    getFirestoreTriggerDatabase(process.env.FB_FIRESTORE_EDITION, projectId);

// Auth
requiresRole("roles/firebaseauth.admin");
requiresRole("roles/iam.serviceAccountTokenCreator");
// Firestore
requiresRole("roles/datastore.user");
// Realtime Database
requiresRole("roles/firebasedatabase.viewer");
// Storage
requiresRole("roles/storage.objectAdmin");
// Eventarc
requiresRole("roles/eventarc.eventReceiver");
requiresRole("roles/run.invoker");
// Genkit
requiresRole("roles/monitoring.metricWriter");
requiresRole("roles/cloudtrace.agent");
requiresRole("roles/logging.logWriter");
const usesVertexAI = Object.values(schema.collections)
    .some(({ai: aiConfig}) => aiConfig?.chat || aiConfig?.embedding);
if (usesVertexAI) {
    requiresRole("roles/aiplatform.user");
}

const ai = genkit({
    plugins: [vertexAI({
        location: process.env.FB_AI_REGION || "us-central1",
    })],
});

enableFirebaseTelemetry();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stoker: any = {};

// START CUSTOM FUNCTIONS

stoker["notifications"] = onDocumentCreated({
    document: "tenants/{tenantId}/Inbox/{messageId}",
    database: firestoreDatabase,
}, (event) => {
    return messageNotifications(
        event,
        globalConfig,
    );
});

// END CUSTOM FUNCTIONS

stoker["customtoken"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    return customToken(request);
});

stoker["schema"] = onCall({
    cors: true,
    consumeAppCheckToken: false,
}, (request) => {
    return getSchema(request);
});

stoker["readapi"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request, response) => {
    return readApi(request, response);
});

stoker["writeapi"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    return writeApi(request);
});

if (process.env.STOKER_ALGOLIA_ID) {
    const algoliaAdminKey = defineSecret("ALGOLIA_ADMIN_KEY");
    stoker["search"] = onCall({
        cors: true,
        consumeAppCheckToken,
        secrets: [algoliaAdminKey],
    }, (request) => {
        return searchResults(request, schema, algoliaAdminKey);
    });
}

stoker["revokemfa"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    return revokeMfa(request);
});

stoker["getfiles"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    return getFiles(request, schema);
});

stoker["deletefolder"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    return deleteFolder(request, schema);
});

stoker["writelog"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    return getWriteLog(request, schema);
});

Object.values(schema.collections).forEach((collectionSchema) => {
    const {labels, access, ai: aiConfig, softDelete} = collectionSchema;
    const {serverWriteOnly} = access;
    const collectionNameLower = labels.collection.toLowerCase();
    const path = getPathCollections(collectionSchema, schema);
    // eslint-disable-next-line max-len
    const document = `tenants/{tenantId}/${path.map((collection: CollectionSchema) =>
        `${collection.labels.collection}/{${collection.labels.record}Id}`
    ).join("/")}`;

    // START CUSTOM COLLECTION LEVEL FUNCTIONS

    // END CUSTOM COLLECTION LEVEL FUNCTIONS

    const hasSkipValidationFields = collectionSchema.fields
        .some((field) =>
            "skipRulesValidation" in field && field.skipRulesValidation) ||
                collectionSchema.skipRulesValidation;

    if (hasSkipValidationFields && !serverWriteOnly) {
        stoker[`validatefields${collectionNameLower}`] =
        onDocumentWritten({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return validateFields(
                event,
                collectionSchema,
                globalConfig,
                schema
            );
        });
    }

    if (collectionSchema.enableWriteLog) {
        stoker[`verifywritelog${collectionNameLower}`] =
        onDocumentWritten({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return verifyWriteLog(event, collectionSchema);
        });
    }

    const readRoles = schema.config.roles.filter((role) =>
        roleHasOperationAccess(collectionSchema, role, "read"));
    if (
        collectionSchema.fullTextSearch &&
        process.env.STOKER_ALGOLIA_ID &&
        !readRoles.every((role) =>
            collectionSchema.preloadCache?.roles.includes(role) ||
            collectionSchema.access.serverReadOnly?.includes(role)
        )) {
        const algoliaAdminKey = defineSecret("ALGOLIA_ADMIN_KEY");
        stoker[`fulltextsearch${collectionNameLower}`] =
        onDocumentWritten({
            document,
            database: firestoreDatabase,
            retry: true,
            secrets: [algoliaAdminKey],
        }, (event) => {
            return fullTextSearch(
                event,
                collectionSchema,
                algoliaAdminKey
            );
        });
    }

    const hasAutoIncrementFields = collectionSchema.fields
        .some((field) => "autoIncrement" in field && field.autoIncrement);

    if (hasAutoIncrementFields) {
        stoker[`autoincrement${collectionNameLower}`] =
        onDocumentWritten({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return autoIncrement(event, collectionSchema, schema);
        });
    }

    stoker[`validatedenormalized${collectionNameLower}`] =
        onDocumentWritten({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return validateDenormalized(event, collectionSchema, schema);
        });

    const hasDependentIncludeFields = Object.values(schema.collections)
        .some((collection) => collection.fields
            .some((field) => "collection" in field &&
                field.collection === labels.collection &&
                field.includeFields));

    if (hasDependentIncludeFields) {
        stoker[`includefields${collectionNameLower}`] =
        onDocumentUpdated({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return updateIncludeFields(event, collectionSchema, schema);
        });
    }

    const hasRelationFields = collectionSchema.fields
        .some((field) => "collection" in field && field.collection);

    if (hasRelationFields) {
        stoker[`validaterelations${
            collectionNameLower
        }`] =
        onDocumentWritten({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return validateRelations(
                event,
                collectionSchema,
                schema,
            );
        });
    }

    const hasDependentNonTwoWayRelations = Object.values(schema.collections)
        .some((collection) => collection.fields
            .some((field) => "collection" in field &&
                field.collection === labels.collection &&
                !("twoWay" in field && field.twoWay)));

    if (hasDependentNonTwoWayRelations) {
        stoker[`removerelations${
            collectionNameLower
        }`] =
        onDocumentDeleted({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return removeRelations(
                event,
                collectionSchema,
                schema,
            );
        });
    }

    const hasUniqueFields = collectionSchema.fields
        .some((field) => "unique" in field && field.unique);

    if (hasUniqueFields) {
        stoker[`uniquedelete${collectionNameLower}`] =
        onDocumentWritten({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return uniqueDelete(
                event,
                collectionSchema,
            );
        });
    }

    stoker[`deletefiles${collectionNameLower}`] =
        onDocumentDeleted({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return deleteFiles(
                event,
                collectionSchema,
            );
        });

    if (aiConfig?.embedding) {
        stoker[`embedding${collectionNameLower}`] =
        onDocumentWritten({
            document,
            database: firestoreDatabase,
            retry: true,
        }, (event) => {
            return writeEmbedding(
                event,
                collectionSchema,
                schema,
            );
        });
    }

    if (aiConfig?.chat &&
        process.env.STOKER_SKIP_GENKIT_FUNCTIONS !== "true") {
        stoker[`chat${collectionNameLower}`] =
        onCallGenkit({
            cors: true,
            consumeAppCheckToken: false,
            authPolicy: (auth) => chatAuthPolicy(auth, collectionSchema),
        }, chatFlow(collectionSchema, schema, ai));
    }

    if (softDelete) {
        stoker[`deletetrash${collectionNameLower}`] = onSchedule({
            region: process.env.FB_FUNCTIONS_REGION,
            schedule: "every day 00:00",
            timeZone,
            retryCount: 3,
        }, () => {
            return deleteTrash(
                collectionSchema,
            );
        });
    }
});

stoker["validateuser"] = onUserCreated({
    retry: true,
}, (event) => {
    return validateUser(event.data);
});

if (process.env.STOKER_SMS_ENABLED === "true") {
    const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = defineSecret("TWILIO_PHONE_NUMBER");
    stoker["sendmessage"] = onDocumentCreated({
        document: "system_messages/{messageId}",
        database: firestoreDatabase,
        retry: true,
        secrets: [twilioAccountSid, twilioAuthToken, twilioPhoneNumber],
    }, (event) => {
        return sendSMSMessage(
            event,
            twilioAccountSid,
            twilioAuthToken,
            twilioPhoneNumber,
        );
    });
}

stoker["adminemail"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    const user = request.auth?.uid;
    const token = request.auth?.token;
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        throw new HttpsError(
            "permission-denied",
            "User does not have permission to access this database",
        );
    }
    if (!user) {
        throw new HttpsError("unauthenticated", "User is not authenticated");
    }
    if (!process.env.ADMIN_EMAIL) return;
    return sendMail(
        process.env.ADMIN_EMAIL,
        request.data.subject,
        request.data.text,
        request.data.html,
        request.data.cc,
        request.data.bcc,
        request.data.replyTo
    );
});

stoker["adminsms"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    const user = request.auth?.uid;
    const token = request.auth?.token;
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        throw new HttpsError(
            "permission-denied",
            "User does not have permission to access this database",
        );
    }
    if (!user) {
        throw new HttpsError("unauthenticated", "User is not authenticated");
    }
    if (!process.env.ADMIN_PHONE) return;
    return sendMessage(process.env.ADMIN_PHONE, request.data.body);
});

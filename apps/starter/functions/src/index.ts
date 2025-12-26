import {initializeApp} from "firebase-admin/app";
import {
    onDocumentCreated,
    onDocumentDeleted,
    onDocumentUpdated,
    onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {onCall, onCallGenkit, HttpsError} from "firebase-functions/v2/https";
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
} from "@stoker-platform/utils";
import {
    CollectionSchema,
    CollectionsSchema,
} from "@stoker-platform/types";
import globalConfig from "./system-custom/main.js";
import * as functions from "firebase-functions/v1";
import {genkit} from "genkit";
import {vertexAI} from "@genkit-ai/vertexai";
import {enableFirebaseTelemetry} from "@genkit-ai/firebase";
import {sendMail, sendMessage} from "@stoker-platform/node-client";

import * as dotenv from "dotenv";
import {onSchedule} from "firebase-functions/v2/scheduler";

import {billingPDF} from "./billingPDF.js";

dotenv.config();

initializeApp();
setGlobalVariables();

const projectDataFile = readFileSync("project-data.json", "utf8");
const projectData = JSON.parse(projectDataFile);
const timeZone: string = projectData.timezone;
const schema: CollectionsSchema = projectData.schema;
const consumeAppCheckToken =
    process.env.FB_FUNCTIONS_CONSUME_APP_CHECK_TOKEN === "true";
const v1Region = process.env.FB_FUNCTIONS_V1_REGION ||
    process.env.FB_FUNCTIONS_REGION;

const ai = genkit({
    plugins: [vertexAI({
        location: process.env.FB_AI_REGION || "us-central1",
    })],
});

enableFirebaseTelemetry();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stoker: any = {};

// START CUSTOM FUNCTIONS

const jsReportKey = defineSecret("JS_REPORT_KEY");

stoker["notifications"] = onDocumentCreated({
    document: "tenants/{tenantId}/Inbox/{messageId}",
}, (event) => {
    return messageNotifications(
        event,
        globalConfig,
    );
});

stoker["billingpdf"] = onCall({
    cors: true,
    consumeAppCheckToken,
    secrets: [jsReportKey],
}, (request) => {
    return billingPDF(request, schema, jsReportKey);
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

stoker["writelog"] = onCall({
    cors: true,
    consumeAppCheckToken,
}, (request) => {
    return getWriteLog(request, schema);
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

Object.values(schema.collections).forEach((collectionSchema) => {
    const {labels, access, ai: aiConfig, softDelete} = collectionSchema;
    const {serverWriteOnly} = access;
    const collectionNameLower = labels.collection.toLowerCase();
    const path = getPathCollections(collectionSchema, schema);
    const document = path.map((collection: CollectionSchema) =>
        // eslint-disable-next-line max-len
        `tenants/{tenantId}/${collection.labels.collection}/{${collection.labels.record}Id}`)
        .join("/");

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
            retry: true,
        }, (event) => {
            return verifyWriteLog(event, collectionSchema);
        });
    }

    if (
        collectionSchema.fullTextSearch &&
        process.env.STOKER_ALGOLIA_ID &&
        !schema.config.roles.every((role) =>
            collectionSchema.preloadCache?.roles.includes(role) ||
            collectionSchema.access.serverReadOnly?.includes(role)
        )) {
        const algoliaAdminKey = defineSecret("ALGOLIA_ADMIN_KEY");
        stoker[`fulltextsearch${collectionNameLower}`] =
        onDocumentWritten({
            document,
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
            retry: true,
        }, (event) => {
            return autoIncrement(event, collectionSchema, schema);
        });
    }

    stoker[`validatedenormalized${collectionNameLower}`] =
        onDocumentWritten({
            document,
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
            retry: true,
        }, (event) => {
            return writeEmbedding(
                event,
                collectionSchema,
                schema,
            );
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const webAppConfig = JSON.parse(process.env.STOKER_FB_WEB_APP_CONFIG!);
    const projectNumber = webAppConfig.messagingSenderId;
    if (aiConfig?.chat) {
        stoker[`chat${collectionNameLower}`] =
        onCallGenkit({
            cors: true,
            consumeAppCheckToken: false,
            // eslint-disable-next-line max-len
            serviceAccount: `${projectNumber}-compute@developer.gserviceaccount.com`,
            authPolicy: (auth) => chatAuthPolicy(auth, collectionSchema),
        }, chatFlow(collectionSchema, schema, ai));
    }

    if (softDelete) {
        stoker[`deletetrash${collectionNameLower}`] = onSchedule({
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

const enforceAppCheck = process.env.STOKER_FB_ENABLE_APP_CHECK === "true";
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const timeoutSeconds = parseInt(process.env.FB_FUNCTIONS_TIMEOUT!);

stoker["validateuser"] =
    functions.runWith({
        timeoutSeconds,
        enforceAppCheck,
        failurePolicy: true,
        memory: "1GB",
        minInstances: parseInt(
            process.env.FB_FUNCTIONS_MIN_INSTANCES || "0",
        ),
        maxInstances: parseInt(
            process.env.FB_FUNCTIONS_MAX_INSTANCES || "5",
        ),
    }).region(v1Region || "us-west1").auth.user().onCreate((user) => {
        return validateUser(user);
    });

if (process.env.STOKER_SMS_ENABLED === "true") {
    const twilioAccountSid = defineSecret("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = defineSecret("TWILIO_AUTH_TOKEN");
    const twilioPhoneNumber = defineSecret("TWILIO_PHONE_NUMBER");
    stoker["sendmessage"] = onDocumentCreated({
        document: "system_messages/{messageId}",
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

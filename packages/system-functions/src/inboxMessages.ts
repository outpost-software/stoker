import {
    addRecord,
    getSome,
    getUser,
    initializeStoker,
    runWithTenant,
    updateRecord,
} from "@stoker-platform/node-client";
import {
    StokerCollection,
    StokerRelationObject,
} from "@stoker-platform/types";
import {
    FirestoreEvent,
    QueryDocumentSnapshot,
} from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {join} from "path";

const maxEventAge = 60 * 60 * 1000;

export const inboxMessages = (
    event: FirestoreEvent<QueryDocumentSnapshot | undefined, {
        tenantId: string;
        messageId: string;
    }>,
    copyFields: string[] = [],
    collection: StokerCollection = "Users",
) => {
    return runWithTenant(event.params.tenantId, async () => {
        const tenantId = event.params.tenantId;
        const snapshot = event.data;
        if (!snapshot) return;
        const data = snapshot.data();
        if (data.Created_By === "System") return;

        try {
            await initializeStoker(
                "production",
                tenantId,
                join(process.cwd(), "lib", "system-custom", "main.js"),
                join(process.cwd(), "lib", "system-custom", "collections"),
                true,
            );

            const user = await getUser(data.Created_By);
            const {records: existing} = await getSome(["Inbox"], {
                constraints: [["Outbox_Message", "==", snapshot.id]],
            });
            const delivered = new Set(existing.map((record) =>
                Object.keys(record.Recipient)[0]));

            const copied = Object.fromEntries(copyFields
                // eslint-disable-next-line security/detect-object-injection
                .filter((field) => data[field] !== undefined)
                // eslint-disable-next-line security/detect-object-injection
                .map((field) => [field, data[field]]));

            const recipients = Object.entries(
                data.Recipients as StokerRelationObject
            );
            for (const [id, recipient] of recipients) {
                if (delivered.has(id)) continue;
                await addRecord(["Inbox"], {
                    ...copied,
                    Subject: data.Subject,
                    Message: data.Message,
                    Recipient: {
                        [id]: {
                            Collection_Path: [collection],
                            Name: recipient.Name,
                        },
                    },
                    Recipients: data.Recipients,
                    Status: "Unread",
                    Sender: {
                        [user.customClaims?.doc as string]: {
                            Collection_Path: [collection],
                            Name: user.displayName,
                        },
                    },
                    Outbox_Message: snapshot.id,
                });
            }
        } catch (error) {
            errorLogger(error);
            const eventAge = Date.now() - Date.parse(event.time);
            if (eventAge < maxEventAge) throw error;
            await updateRecord(["Outbox"], snapshot.id, {
                Status: "Failed",
            });
        }
    });
};

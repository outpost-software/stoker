import {
    getOne,
    initializeStoker,
    sendMail,
    updateRecord,
} from "@stoker-platform/node-client";
import {
    GenerateGlobalConfig,
    StokerRecord,
    StokerRelationObject,
} from "@stoker-platform/types";
import {
    FirestoreEvent,
    QueryDocumentSnapshot,
} from "firebase-functions/v2/firestore";
import {join} from "path";
import {
    error as errorLogger,
} from "firebase-functions/logger";

/* eslint-disable max-len */

export const messageNotifications = (
    event: FirestoreEvent<QueryDocumentSnapshot | undefined, {
        tenantId: string;
        messageId: string;
    }>,
    globalConfig: GenerateGlobalConfig,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const doc = snapshot.data();
        const appName = globalConfig("node").appName;

        await initializeStoker(
            "production",
            tenantId,
            join(process.cwd(), "lib", "system-custom", "main.js"),
            join(process.cwd(), "lib", "system-custom", "collections"),
            true,
        );

        const toId = Object.keys(doc.Recipient)[0];
        const to = await getOne(["Users"], toId) as StokerRecord;
        const sender = Object.values(doc.Sender as StokerRelationObject)[0].Name;

        try {
            await sendMail(to.Email, `${appName} - New Message`, `You have a new message from ${sender}:\n\n${doc.Subject}`);
            await updateRecord(["Outbox"], doc.Outbox_Message, {
                Status: "Success",
            });
        } catch (error) {
            await updateRecord(["Outbox"], doc.Outbox_Message, {
                Status: "Failed",
            });
            errorLogger(error);
        }
        return;
    })();
};

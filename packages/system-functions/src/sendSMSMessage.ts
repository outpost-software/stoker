import {
    FirestoreEvent,
    QueryDocumentSnapshot,
} from "firebase-functions/firestore";
import twilio from "twilio";
import {
    error as errorLogger,
    info,
} from "firebase-functions/logger";
import {Timestamp} from "firebase-admin/firestore";

let twilioClient: ReturnType<typeof twilio> | null = null;

const initializeTwilio = (
    accountSid: string,
    authToken: string,
): ReturnType<typeof twilio> => {
    if (twilioClient) {
        return twilioClient;
    }
    twilioClient = twilio(accountSid, authToken, {
        lazyLoading: true,
    });
    return twilioClient;
};

export const sendSMSMessage = (
    event: FirestoreEvent<QueryDocumentSnapshot | undefined, {
        messageId: string;
    }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    twilioAccountSid: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    twilioAuthToken: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    twilioPhoneNumber: any,
) => {
    return (async () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const doc = snapshot.data();

        const to = doc.to;
        const body = doc.body;

        if (!to || typeof to !== "string") {
            errorLogger("to field is required and must be a string");
            return;
        }
        if (!body || typeof body !== "string") {
            errorLogger("body field is required and must be a string");
            return;
        }

        try {
            const client = initializeTwilio(
                twilioAccountSid.value(),
                twilioAuthToken.value(),
            );
            const from = twilioPhoneNumber.value();

            const message = await client.messages.create({
                from,
                to,
                body,
            });

            info(
                `SMS message ${message.sid} sent successfully.`
            );

            await snapshot.ref.update({
                status: "SUCCESS",
                timestamp: Timestamp.now(),
            });

            return;
        } catch (error: unknown) {
            const errorMessage =
                error as Error & { code?: string; moreInfo?: string };

            errorLogger(
                errorMessage.code,
                errorMessage.message,
                errorMessage.moreInfo || "",
            );

            await snapshot.ref.update({
                status: "FAILED",
                timestamp: Timestamp.now(),
            });
        }
    })();
};

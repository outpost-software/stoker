import {Change, DocumentSnapshot, FirestoreEvent}
    from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    CollectionSchema,
    CollectionsSchema,
    GenerateGlobalConfig,
    StokerRecord,
} from "@stoker-platform/types";
import {tryPromise,
    validateRecord,
} from "@stoker-platform/utils";
import {join} from "node:path";
import {
    initializeStoker,
    sendMail,
    validateRelations,
    validateSoftDelete,
} from "@stoker-platform/node-client";
import cloneDeep from "lodash/cloneDeep.js";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";

/* eslint-disable max-len */

export const validateFields = (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined,
    Record<string, unknown>>,
    collection: CollectionSchema,
    globalConfig: GenerateGlobalConfig,
    schema: CollectionsSchema,
) => {
    return (async () => {
        const tenantId = event.params.tenantId as string;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const before = snapshot.before.data() as StokerRecord | undefined;
        const after = snapshot.after.data() as StokerRecord | undefined;
        const db = getFirestore();

        if (after?.Last_Write_By === "System") return;
        if ((before?.Last_Write_At as Timestamp)?.valueOf() === (after?.Last_Write_At as Timestamp)?.valueOf()) return;

        const {labels, softDelete} = collection;

        if (after) {
            const {
                getCustomizationFile,
            } = await initializeStoker(
                "production",
                tenantId,
                join(process.cwd(), "lib", "system-custom", "main.js"),
                join(process.cwd(), "lib", "system-custom", "collections"),
                true,
            );

            const customization = getCustomizationFile(labels.collection, schema);

            try {
                const operation = before ? "update" : "create";
                const record = cloneDeep(after) as StokerRecord;
                if (!before) {
                    const savedAt = record.Saved_At as Timestamp;
                    if (!(savedAt instanceof Timestamp)) {
                        throw new Error("Saved_At is not a valid Timestamp");
                    }
                    record.Saved_At = FieldValue.serverTimestamp();
                }
                const lastSaveAt = record.Last_Save_At as Timestamp;
                if (!(lastSaveAt instanceof Timestamp)) {
                    throw new Error("Last_Save_At is not a valid Timestamp");
                }
                record.Last_Save_At = FieldValue.serverTimestamp();
                if (softDelete && record[softDelete.archivedField] === true) {
                    const archivedAt = record[softDelete.timestampField] as Timestamp;
                    if (!(archivedAt instanceof Timestamp)) {
                        throw new Error(`${softDelete.archivedField} is not a valid Timestamp`);
                    }
                    record[softDelete.timestampField] = FieldValue.serverTimestamp();
                }
                await validateRecord(operation, record as StokerRecord, collection, customization, [operation, after, {}, undefined, operation === "update" ? before : undefined], schema);
                if (operation === "update" && before) {
                    validateSoftDelete("update", collection, after, before);
                }
                await db.runTransaction(async (transaction) => {
                    await validateRelations(
                        "Update",
                        tenantId,
                        snapshot.after.id,
                        record,
                        record,
                        collection,
                        schema,
                        transaction,
                        {size: 0},
                    );
                });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                const appName = await tryPromise(globalConfig("node").appName);
                const adminEmail = process.env.ADMIN_EMAIL;
                if (adminEmail) {
                    await sendMail(adminEmail, `Invalid Stoker Write - ${appName} - ${tenantId} - ${labels.collection} - ${snapshot.after.id}`, error.message).catch((error) => {
                        errorLogger("Error sending email", error);
                    });
                }
            }
        }
        return;
    })();
};

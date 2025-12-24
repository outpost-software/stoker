import {Change, DocumentSnapshot, FirestoreEvent}
    from "firebase-functions/v2/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    Timestamp,
} from "firebase-admin/firestore";
import {
    CollectionSchema,
    StokerRecord,
    WriteLogEntry,
} from "@stoker-platform/types";

/* eslint-disable max-len */

export const verifyWriteLog = (
    event: FirestoreEvent<Change<DocumentSnapshot> | undefined,
    Record<string, unknown>>,
    collection: CollectionSchema,
) => {
    return (async () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const snapshot = event.data!;
        const before = snapshot.before.data() as StokerRecord | undefined;
        const after = snapshot.after.data() as StokerRecord | undefined;

        const {labels} = collection;

        let data: StokerRecord | undefined;
        let originalRecord: StokerRecord | undefined;
        let operation: "create" | "update" | "delete" | undefined;

        if (!before) {
            operation = "create";
            // eslint-disable-next-line max-len
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            data = after!;
            originalRecord = undefined;
        } else if (!after) {
            operation = "delete";
            data = before;
            originalRecord = undefined;
        } else if (
            before.Last_Write_By !== after.Last_Write_By ||
            (before.Last_Write_At as Timestamp).valueOf() !== (after.Last_Write_At as Timestamp).valueOf() ||
            (before.Last_Save_At as Timestamp).valueOf() !== (after.Last_Save_At as Timestamp).valueOf()) {
            operation = "update";
            data = after;
            originalRecord = before;
        } else {
            operation = undefined;
            data = undefined;
            originalRecord = undefined;
        }

        if (operation && operation !== "delete" && data) {
            const log: WriteLogEntry = {
                operation,
                collection: labels.collection,
                docId: snapshot.after.id as string,
                user: data.Last_Write_By,
                status: "verified",
                Collection_Path: data.Collection_Path,
                Last_Write_At: data.Last_Write_At,
                Last_Save_At: data.Last_Save_At,
                Last_Write_By: data.Last_Write_By,
                Last_Write_Connection_Status: data.Last_Write_Connection_Status,
                Last_Write_App: data.Last_Write_App,
                Last_Write_Version: data.Last_Write_Version,
                data: {},
            };
            log.data.finalRecord = data;
            operation === "update" ? log.data.finalOriginal = originalRecord :
                log.data.finalOriginal = {} as StokerRecord;

            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });

            await snapshot.after.ref.collection("system_write_log")
                .doc(`${data.Last_Write_By}-${(data.Last_Write_At as Timestamp).valueOf()}`)
                .set(log, {mergeFields: [
                    ...Object.keys(log).filter((key) => key !== "data"),
                    "data.finalRecord",
                    "data.finalOriginal",
                ]}).catch((error: unknown) => {
                    errorLogger(error);
                });
        }
        return;
    })();
};

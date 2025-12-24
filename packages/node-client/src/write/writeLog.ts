import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { CollectionSchema, StokerRecord, WriteLogEntry } from "@stoker-platform/types"
import cloneDeep from "lodash/cloneDeep.js"
import { getFirestorePathRef } from "../utils/getFirestorePathRef.js"
import { tryPromise, removeDeleteSentinels } from "@stoker-platform/utils"
import { getGlobalConfigModule } from "../initializeStoker.js"

export const writeLog = async (
    operation: "create" | "update" | "delete",
    status: "started" | "written" | "success" | "failed",
    data: StokerRecord,
    tenantId: string,
    path: string[],
    docId: string,
    collectionSchema: CollectionSchema,
    error?: unknown,
    originalRecord?: StokerRecord,
): Promise<void> => {
    const { labels } = collectionSchema

    const db = getFirestore()
    const globalConfig = getGlobalConfigModule()

    const TTL = await tryPromise(globalConfig.firebase?.writeLogTTL)

    const log: WriteLogEntry = {
        operation,
        collection: labels.collection,
        docId,
        user: "System",
        status,
        Collection_Path: path,
        Last_Write_At: data.Last_Write_At,
        Last_Write_By: data.Last_Write_By,
        Last_Write_Connection_Status: data.Last_Write_Connection_Status,
        Last_Write_App: data.Last_Write_App,
        Last_Write_Version: data.Last_Write_Version,
        data: {},
    }

    if (TTL) {
        const today = new Date()
        const date = new Date(new Date().setDate(today.getDate() + TTL))
        log.TTL = Timestamp.fromDate(date)
    }

    const record = cloneDeep(data)
    removeDeleteSentinels(record)
    if (operation !== "delete") log.data.data = cloneDeep(record)
    if (operation === "update") log.data.originalRecord = cloneDeep(originalRecord)

    if (operation !== "delete") {
        if (["started", "written"].includes(status)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            delete log.data.data!.Saved_At
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            delete log.data.data!.Last_Save_At
        }
    }
    status === "failed" && (log.data.error = JSON.stringify(error))

    const ref = getFirestorePathRef(db, path, tenantId)

    const timestamp = data.Last_Write_At as Timestamp
    await ref.doc(docId).collection("system_write_log").doc(`${data.Last_Write_By}-${timestamp.valueOf()}`).set(log)

    return
}

import { getFirestoreWrite, getGlobalConfigModule, getTenant } from "../initializeStoker.js"
import { Timestamp, doc, setDoc } from "firebase/firestore"
import { CollectionSchema, StokerRecord, WriteLogEntry } from "@stoker-platform/types"
import cloneDeep from "lodash/cloneDeep.js"
import { getCachedConfigValue, removeDeleteSentinels } from "@stoker-platform/utils"
import { serializeDeleteSentinels } from "../utils/serializeDeleteSentinels.js"

export const writeLog = async (
    operation: "create" | "update" | "delete",
    status: "started" | "written" | "success" | "failed",
    data: StokerRecord,
    path: string[],
    docId: string,
    collectionSchema: CollectionSchema,
    userId: string,
    error?: unknown,
    originalRecord?: StokerRecord,
): Promise<void> => {
    const tenantId = getTenant()
    const { labels } = collectionSchema
    const globalConfig = getGlobalConfigModule()
    const dbWrite = getFirestoreWrite()

    const TTL = await getCachedConfigValue(globalConfig, ["global", "firebase", "writeLogTTL"])

    const log: WriteLogEntry = {
        operation,
        collection: labels.collection,
        docId,
        user: userId,
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
    if (operation !== "delete") {
        log.data.data = record
        if (status === "written") {
            serializeDeleteSentinels(log.data.data)
        }
    }
    if (operation !== "delete" && status !== "written") {
        removeDeleteSentinels(record)
    }

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

    const timestamp = data.Last_Write_At as Timestamp
    const logCollection = doc(
        dbWrite,
        "tenants",
        tenantId,
        path.join("/"),
        docId,
        "system_write_log",
        `${userId}-${timestamp.valueOf()}`,
    )
    setDoc(logCollection, log).catch((error) => {
        console.error(
            `Error saving "${status}" ${operation} log entry for record ${docId} in ${labels.collection} collection.`,
            { cause: error },
        )
    })
    return
}

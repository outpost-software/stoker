import { CollectionsSchema, StokerRecord, WriteLogEntry } from "@stoker-platform/types"
import { collectionGroup, getDocsFromCache, orderBy, query, serverTimestamp, where } from "firebase/firestore"
import { getFirestoreWrite, getVersionInfo } from "./initializeStoker"
import { getAuth, User } from "firebase/auth"
import { addRecord } from "./write/addRecord.js"
import { writeLog } from "./write/writeLog.js"
import { updateRecord } from "./write/updateRecord.js"
import { deleteRecord } from "./write/deleteRecord.js"
import { deserializeDeleteSentinels } from "./utils/deserializeDeleteSentinels"
import { callFunction } from "./utils/callFunction"

let retrying: {
    [id: string]: number
} = {}

export const retryPendingWrites = async (schema: CollectionsSchema, user: User) => {
    const auth = getAuth()
    const dbWrite = getFirestoreWrite()
    const currentUser = auth.currentUser

    if (currentUser?.uid !== user.uid) return
    const writeLogEntries = await getDocsFromCache(
        query(
            collectionGroup(dbWrite, "system_write_log"),
            where("status", "==", "written"),
            where("user", "==", user.uid),
            orderBy("Last_Write_At", "asc"),
        ),
    )

    await new Promise((resolve) => setTimeout(resolve, 10000))

    const versionInfo = getVersionInfo()
    if (versionInfo?.version) {
        for (const doc of writeLogEntries.docs) {
            retrying[doc.id] ??= 0
            const log = doc.data() as WriteLogEntry
            const { data, operation, docId, collection, Collection_Path, Last_Write_Version } = log

            await new Promise((resolve) => setTimeout(resolve, 1000))

            const serverLog = (await callFunction("stoker-writelog", {
                path: Collection_Path,
                id: docId,
                log: doc.id,
            })) as { status: string }
            if (!serverLog || serverLog.status !== "written") continue
            if (currentUser?.uid !== user.uid) return
            if (versionInfo.force && Last_Write_Version !== versionInfo.version) {
                writeLog(
                    operation,
                    "failed",
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    data.data! as StokerRecord,
                    Collection_Path,
                    docId,
                    // eslint-disable-next-line security/detect-object-injection
                    schema.collections[collection],
                    user.uid,
                    `Version mismatch- write log version ${Last_Write_Version} not compatible with forced version ${versionInfo.version}`,
                    operation === "update" ? data.originalRecord : undefined,
                )
                continue
            }
            const retry = localStorage.getItem(`stoker-retry-${docId}`)
            if (retry === "done") continue
            if (retry && Date.now() - parseInt(retry) < 10000) continue
            localStorage.setItem(`stoker-retry-${docId}`, Date.now().toString())
            console.info(`Retrying pending ${operation} operation: ${doc.ref.path}`)
            /* eslint-disable security/detect-object-injection, @typescript-eslint/no-non-null-assertion */
            if (operation === "create") {
                retrying[docId]++
                await addRecord(Collection_Path, data.data!, undefined, {
                    retry: {
                        type: "offline",
                        docId,
                    },
                }).catch((error: unknown) => {
                    console.error(error)
                })
                retrying[docId]--
                localStorage.setItem(`stoker-retry-${docId}`, "done")
            }
            if (operation === "update") {
                const CollectionSchema = schema.collections[collection]
                const { softDelete } = CollectionSchema
                if (
                    softDelete &&
                    data.data?.[softDelete.archivedField] &&
                    data.data?.[softDelete.archivedField] !== data.originalRecord?.[softDelete.archivedField]
                ) {
                    data.data[softDelete.timestampField] = serverTimestamp()
                }
                if (data.data) {
                    deserializeDeleteSentinels(data.data)
                }
                retrying[docId]++
                await updateRecord(Collection_Path, docId, data.data!, undefined, {
                    retry: {
                        type: "offline",
                        originalRecord: data.originalRecord!,
                    },
                }).catch((error: unknown) => {
                    console.error(error)
                })
                retrying[docId]--
                localStorage.setItem(`stoker-retry-${docId}`, "done")
            }
            if (operation === "delete") {
                retrying[docId]++
                await deleteRecord(Collection_Path, docId, {
                    retry: {
                        type: "offline",
                        record: {
                            Last_Write_At: log.Last_Write_At,
                            Last_Write_By: log.Last_Write_By,
                            Last_Write_Connection_Status: log.Last_Write_Connection_Status,
                            Last_Write_App: log.Last_Write_App,
                            Last_Write_Version: log.Last_Write_Version,
                        } as StokerRecord,
                    },
                }).catch((error: unknown) => {
                    console.error(error)
                })
                retrying[docId]--
                localStorage.setItem(`stoker-retry-${docId}`, "done")
            }
            /* eslint-enable security/detect-object-injection, @typescript-eslint/no-non-null-assertion */
        }
    }
    return
}

export const isRetrying = (docId: string) => {
    // eslint-disable-next-line security/detect-object-injection
    return !!retrying[docId]
}
export const clearRetrying = () => {
    retrying = {}
}

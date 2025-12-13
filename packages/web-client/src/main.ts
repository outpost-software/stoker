import type { DocumentSnapshot } from "firebase/firestore"

export * from "./initializeStoker.js"
export { authenticateStoker } from "./authenticateStoker.js"
export { onStokerReady } from "./utils/onReady.js"
export { onStokerSignOut } from "./utils/onSignOut.js"
export { onStokerPermissionsChange } from "./utils/onPermissionsChange.js"
export { multiFactorEnroll } from "./multiFactorEnroll.js"
export { addRecord } from "./write/addRecord.js"
export { updateRecord } from "./write/updateRecord.js"
export { deleteRecord } from "./write/deleteRecord.js"
export { deleteFolder } from "./write/deleteFolder.js"
export { addRecordServer } from "./write/addRecordServer.js"
export { updateRecordServer } from "./write/updateRecordServer.js"
export { deleteRecordServer } from "./write/deleteRecordServer.js"
export { waitForPendingWrites } from "./utils/waitForPendingWrites.js"
export { getCollectionRefs } from "./read/getCollectionRefs.js"
export { getDocumentRefs } from "./read/getDocumentRefs.js"
export { getOne } from "./read/getOne.js"
export { getSome } from "./read/getSome.js"
export { subscribeOne } from "./read/subscribeOne.js"
export { subscribeMany } from "./read/subscribeMany.js"
export { getOneServer } from "./read/getOneServer.js"
export { getSomeServer } from "./read/getSomeServer.js"
export { getFiles } from "./read/getFiles.js"
export { preloadCache } from "./read/cache/preloadCache.js"
export { preloadCollection } from "./read/cache/preloadCollection.js"
export { sendMail } from "./utils/sendMail.js"
export { sendMessage } from "./utils/sendMessage.js"
export { sendAdminEmail } from "./utils/sendAdminEmail.js"
export { sendAdminSMS } from "./utils/sendAdminSMS.js"
export { signOut } from "./signOut.js"
export { serializeTimestamps } from "./utils/serializeTimestamps.js"
export { deserializeTimestamps } from "./utils/deserializeTimestamps.js"
export {
    convertDateToTimezone,
    convertTimestampToTimezone,
    keepTimezone,
    removeTimezone,
    displayDate,
} from "./utils/convertToTimezone.js"
export { callFunction } from "./utils/callFunction.js"

export { tryPromise, getCachedConfigValue, getSchema as getZodSchema, isDeleteSentinel } from "@stoker-platform/utils"

export type { GetSomeOptions } from "./read/getSome.js"
export type { SubscribeManyOptions } from "./read/subscribeMany.js"
export type Cursor = { first: Map<number, DocumentSnapshot>; last: Map<number, DocumentSnapshot> }

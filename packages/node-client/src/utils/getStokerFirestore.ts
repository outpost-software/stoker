import { getApp } from "firebase-admin/app"
import { getFirestore, Firestore } from "firebase-admin/firestore"
import { getFirestoreDatabaseId } from "@stoker-platform/utils"

export const getStokerFirestore = (): Firestore => {
    const firebaseApp = getApp()
    const firebaseConfigString = process.env.STOKER_FB_WEB_APP_CONFIG
    if (!firebaseConfigString) {
        throw new Error("STOKER_FB_WEB_APP_CONFIG not set.")
    }
    const firebaseConfig = JSON.parse(firebaseConfigString)
    const databaseId = getFirestoreDatabaseId(process.env.FB_FIRESTORE_EDITION, firebaseConfig.projectId)
    return getFirestore(firebaseApp, databaseId)
}

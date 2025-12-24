import { initializeApp, getApp, applicationDefault } from "firebase-admin/app"

export const initializeFirebase = async () => {
    const firebaseConfigString = process.env.STOKER_FB_WEB_APP_CONFIG
    if (!firebaseConfigString) {
        throw new Error("Firebase web app config not found")
    }
    const firebaseConfig = JSON.parse(firebaseConfigString)

    try {
        return getApp()
    } catch {
        return initializeApp({
            credential: applicationDefault(),
            databaseURL: firebaseConfig.databaseURL,
            storageBucket: firebaseConfig.storageBucket,
            projectId: firebaseConfig.projectId,
        })
    }
}

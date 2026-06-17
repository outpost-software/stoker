import { getApp, App } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getFirestoreDatabaseId } from "@stoker-platform/utils"

export const getCLIFirestore = (app?: App) => {
    return getFirestore(
        app || getApp(),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        getFirestoreDatabaseId(process.env.FB_FIRESTORE_EDITION, process.env.GCP_PROJECT!),
    )
}

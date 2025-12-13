import { initializeFirebase } from "@stoker-platform/node-client"
import { getFirestore } from "firebase-admin/firestore"

export const activateMaintenanceMode = async () => {
    await initializeFirebase()
    const db = getFirestore()
    await db.collection("system_deployment").doc("maintenance_mode").set({ active: true })
    console.info("MAINTENANCE MODE ENGAGED")
    process.exit()
}

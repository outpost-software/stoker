import { initializeFirebase } from "@stoker-platform/node-client"
import { getFirestore } from "firebase-admin/firestore"

export const disableMaintenanceMode = async () => {
    await initializeFirebase()
    const db = getFirestore()
    await db.collection("system_deployment").doc("maintenance_mode").set({ active: false })
    console.info("MAINTENANCE MODE DISENGAGED")
    process.exit()
}

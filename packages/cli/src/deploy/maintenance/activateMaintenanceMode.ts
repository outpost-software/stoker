import { initializeFirebase } from "@stoker-platform/node-client"
import { getCLIFirestore } from "../../utils/getCLIFirestore.js"

export const activateMaintenanceMode = async () => {
    await initializeFirebase()
    const db = getCLIFirestore()
    await db.collection("system_deployment").doc("maintenance_mode").set({ active: true })
    console.info("MAINTENANCE MODE ENGAGED")
    process.exit()
}

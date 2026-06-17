import { initializeFirebase } from "@stoker-platform/node-client"
import { getCLIFirestore } from "../../utils/getCLIFirestore.js"

export const disableMaintenanceMode = async () => {
    await initializeFirebase()
    const db = getCLIFirestore()
    await db.collection("system_deployment").doc("maintenance_mode").set({ active: false })
    console.info("MAINTENANCE MODE DISENGAGED")
    process.exit()
}

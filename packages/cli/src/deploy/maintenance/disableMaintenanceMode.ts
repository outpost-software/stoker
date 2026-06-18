import { initializeFirebase, getStokerFirestore } from "@stoker-platform/node-client"

export const disableMaintenanceMode = async () => {
    await initializeFirebase()
    const db = getStokerFirestore()
    await db.collection("system_deployment").doc("maintenance_mode").set({ active: false })
    console.info("MAINTENANCE MODE DISENGAGED")
    process.exit()
}

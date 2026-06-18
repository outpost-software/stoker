import { initializeFirebase, getStokerFirestore } from "@stoker-platform/node-client"

export const activateMaintenanceMode = async () => {
    await initializeFirebase()
    const db = getStokerFirestore()
    await db.collection("system_deployment").doc("maintenance_mode").set({ active: true })
    console.info("MAINTENANCE MODE ENGAGED")
    process.exit()
}

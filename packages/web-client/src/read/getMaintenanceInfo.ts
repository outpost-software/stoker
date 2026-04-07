import { doc, onSnapshot } from "firebase/firestore"
import { getGlobalConfigModule, getFirestoreMaintenance } from "../initializeStoker.js"
import { tryPromise } from "@stoker-platform/utils"

let maintenanceInfo: { active: boolean } | undefined

export const initializeMaintenanceListener = async () => {
    const globalConfig = getGlobalConfigModule()
    const db = getFirestoreMaintenance()

    onSnapshot(
        doc(db, "system_deployment", "maintenance_mode"),
        (snapshot): void => {
            if (snapshot.exists()) {
                maintenanceInfo = snapshot.data() as { active: boolean }
                tryPromise(globalConfig.onMaintenanceUpdate, [maintenanceInfo.active ? "on" : "off"])
            } else {
                console.error("Maintenance status not found")
            }
        },
        (error): void => {
            console.error("Error getting maintenance status", { cause: error.message })
        },
    )
}

export const getMaintenanceInfo = () => maintenanceInfo

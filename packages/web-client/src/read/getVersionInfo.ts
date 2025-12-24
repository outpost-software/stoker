import { doc, onSnapshot } from "firebase/firestore"
import { getGlobalConfigModule, getFirestoreMaintenance } from "../initializeStoker.js"
import { VersionInfo } from "@stoker-platform/types"
import { tryPromise } from "@stoker-platform/utils"

let versionInfo: VersionInfo | undefined
let numberOfUpdates = 0

export const initializeVersionListener = async () => {
    const db = getFirestoreMaintenance()
    const globalConfig = getGlobalConfigModule()
    const versionListener = onSnapshot(
        doc(db, "system_deployment", "latest_deploy"),
        (snapshot): void => {
            if (snapshot.exists()) {
                versionInfo = snapshot.data() as VersionInfo
                numberOfUpdates++
                if (numberOfUpdates > 1) {
                    if (versionInfo.refresh) {
                        window.location.reload()
                    } else {
                        tryPromise(globalConfig.onVersionUpdate, [versionInfo, numberOfUpdates])
                    }
                }
            } else {
                throw new Error("Version info not found")
            }
        },
        (error): void => {
            throw new Error("Error getting version info", { cause: error.message })
        },
    )
    return versionListener
}

export const getVersionInfo = () => versionInfo

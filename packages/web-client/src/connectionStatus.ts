import { getDatabase, onValue, ref } from "firebase/database"
import { getGlobalConfigModule } from "./initializeStoker.js"
import { tryPromise } from "@stoker-platform/utils"

let connectionStatus: "Online" | "Offline"
let offlineTimeout: number | NodeJS.Timeout | null = null

export const initializeConnectionStatus = () => {
    const dbMain = getDatabase()
    const globalConfig = getGlobalConfigModule()
    let initialized = false
    const unsubscribe = onValue(ref(dbMain, ".info/connected"), (snapshot) => {
        if (snapshot.val() === true) {
            if (offlineTimeout) {
                clearTimeout(offlineTimeout)
                offlineTimeout = null
            }
            connectionStatus = "Online"
            tryPromise(globalConfig.onConnectionStatusChange, [connectionStatus, !initialized])
            if (!initialized) initialized = true
        } else {
            if (!offlineTimeout && initialized) {
                offlineTimeout = setTimeout(() => {
                    connectionStatus = "Offline"
                    tryPromise(globalConfig.onConnectionStatusChange, [connectionStatus])
                }, 5000)
            }
        }
    })
    return unsubscribe
}

export const getConnectionStatus = () => {
    return connectionStatus
}
export const getNetworkStatus = () => {
    return navigator.onLine ? "Online" : "Offline"
}

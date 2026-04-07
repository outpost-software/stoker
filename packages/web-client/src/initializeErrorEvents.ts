import { GlobalConfig } from "@stoker-platform/types"
import { tryPromise } from "@stoker-platform/utils"
import { signOut } from "./signOut"

export const initializeErrorEvents = (globalConfig: GlobalConfig) => {
    const processError = (message: string | Event) => {
        if (
            typeof message === "string" &&
            message.includes("Could not reach Cloud Firestore backend. Backend didn't respond within 10 seconds.")
        ) {
            console.warn("Slow Firestore Connection Detected")
            tryPromise(globalConfig.onFirestoreSlowConnection)
        }
        if (
            typeof message === "string" &&
            message.includes("Using maximum backoff delay to prevent overloading the backend.")
        ) {
            console.warn("Firestore Load Failure Detected")
            tryPromise(globalConfig.onFirestoreLoadFailure)
        }
        if (
            typeof message === "string" &&
            message.includes("The user's credential is no longer valid. The user must sign in again.")
        ) {
            console.warn("User Credential Expired")
            signOut()
        }
        if (
            typeof message === "string" &&
            message.includes("Connection to Indexed Database server lost. Refresh the page to try again")
        ) {
            console.warn("Indexed Database Connection Lost")
            tryPromise(globalConfig.onIndexedDBConnectionLost)
        }
    }

    const originalConsoleError = console.error.bind(console)
    let insideConsoleErrorForward = false
    console.error = (...args: unknown[]) => {
        originalConsoleError(...args)
        if (insideConsoleErrorForward) {
            return
        }
        insideConsoleErrorForward = true
        try {
            for (const arg of args) {
                if (typeof arg === "string") {
                    processError(arg)
                } else if (arg instanceof Error) {
                    processError(arg.message)
                }
            }
        } finally {
            insideConsoleErrorForward = false
        }
    }

    window.addEventListener("error", (event) => {
        processError(event.message)
    })

    window.addEventListener("unhandledrejection", (event) => {
        const message = event.reason?.message
        processError(message)
    })
}

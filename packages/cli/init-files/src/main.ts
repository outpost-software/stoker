import type { DialogContent, GenerateGlobalConfig, GlobalConfig, WebUtilities } from "@stoker-platform/types"

const globalConfig: GenerateGlobalConfig = (sdk, utils, context): GlobalConfig => {
    const { setDialogContent, setConnectionStatus } = (context || {}) as {
        setDialogContent: (dialogContent: DialogContent | null) => void
        setConnectionStatus: (connectionStatus: "online" | "offline") => void
    }
    return {
        appName: "Stoker",
        roles: ["Admin", "User"],
        timezone: "Australia/Melbourne",
        disabledCollections: [],
        auth: {
            enableMultiFactorAuth: [],
            authPersistenceType: "LOCAL",
            offlinePersistenceType: "NONE",
        },
        firebase: {
            enableEmulators() {
                const { getEnv } = utils as WebUtilities
                const env = getEnv()
                const mode = env.MODE
                const enable = mode === "development"
                return enable
            },
            GDPRSettings: false,
            enableAnalytics() {
                const { getEnv } = utils as WebUtilities
                const env = getEnv()
                const mode = env.MODE
                const enable = mode === "production"
                return enable
            },
            analyticsSettings: {},
            analyticsConsentSettings: {},
            logLevel: {
                dev: "info",
            },
            permissionsIndexExemption: true,
            writeLogIndexExemption: [],
            serverTimestampOptions: "estimate",
        },
        preload: {
            sync: [],
            async: ["Inbox", "Outbox"],
        },
        enableUserIDLogging: false,
        onConnectionStatusChange(status) {
            if (status === "Offline") {
                setConnectionStatus("offline")
                console.error("Connection lost")
            }
            if (status === "Online") {
                setConnectionStatus("online")
                console.info("Connection restored")
            }
        },
        onVersionUpdate(versionInfo) {
            if (sdk === "web") {
                const payload = versionInfo.payload as { delay: boolean; tabs: boolean }
                if (payload.delay) {
                    setDialogContent({
                        title: "An update is available",
                        description: "The page will refresh in 30 seconds to update to the latest version.",
                    })
                    setTimeout(() => {
                        window.location.reload()
                    }, 30000)
                }
                if (payload.tabs) {
                    setDialogContent({
                        title: "An update is available",
                        description:
                            "Please close ALL of your open tabs to update to the latest version. A page refresh is not sufficient- please fully close all tabs.",
                        disableClose: true,
                    })
                }
            }
        },
        onMaintenanceUpdate(status) {
            if (sdk === "web") {
                const { setMaintenance } = context as { setMaintenance: (maintenance: boolean) => void }
                if (status === "on") {
                    setMaintenance(true)
                } else {
                    setMaintenance(false)
                }
            }
        },
        onFirestoreSlowConnection() {
            setDialogContent({
                title: "Slow connection detected",
                description: "The app is experiencing a slow internet connection.",
            })
        },
        async onFirestoreLoadFailure() {
            if (sdk === "web") {
                const { getAuth } = await import("firebase/auth")
                const { sendAdminEmail } = await import("@stoker-platform/web-client")
                const { currentUser } = getAuth()
                if (!currentUser?.uid) throw new Error("Error sending Firestore load failure email")
                await sendAdminEmail(
                    "Firestore Load Failure Detected",
                    `Firestore load failure detected for user ${currentUser.displayName} - ${currentUser.uid}`,
                )
                    .then(() => {
                        window.location.reload()
                    })
                    .catch(() => {
                        throw new Error("Error sending Firestore load failure email")
                    })
            }
        },
        onIndexedDBConnectionLost() {
            setDialogContent({
                title: "An error occurred",
                description: "The app has experienced an issue and needs to refresh.",
                disableClose: true,
                buttons: [
                    {
                        label: "Refresh",
                        onClick: () => {
                            window.location.reload()
                            setDialogContent(null)
                        },
                    },
                ],
            })
        },
        async onAppCheckTokenFailure(error) {
            if (sdk === "web") {
                if (
                    error.code === "appCheck/throttled" ||
                    error.code === "appCheck/initial-throttle" ||
                    error.code === "appCheck/internal-error" ||
                    error.code === "appCheck/recaptcha-error"
                ) {
                    setDialogContent({
                        title: "Page refresh required",
                        description: "The page needs to be refreshed for security reasons.",
                        disableClose: true,
                        buttons: [
                            {
                                label: "Refresh",
                                onClick: () => {
                                    window.location.reload()
                                    setDialogContent(null)
                                },
                            },
                        ],
                    })
                }
            }
        },
        mail: {
            emailVerification(verificationLink, appName) {
                return {
                    subject: `${appName} - Please verify your email address`,
                    html: `Please verify your email address by clicking the link:
                    </br>
                    </br>
                    <a href="${verificationLink}">${verificationLink}</a>`,
                }
            },
        },
        async postWriteError(operation, _data, docId, context, error) {
            if (sdk === "web") {
                const { sendAdminEmail } = await import("@stoker-platform/web-client")
                const { getAuth } = await import("firebase/auth")
                const { currentUser } = getAuth()
                if (!currentUser?.uid) throw new Error("Error sending Firestore write operation failure email")
                await sendAdminEmail(
                    `Stoker Operation Failure`,
                    `Operation Type: ${operation}\n\nUser: ${currentUser.displayName}\n\nUser ID: ${currentUser.uid}\n\nCollection: ${context.collection}\n\nDocument ID: ${docId}\n\nError Details:\n\n${JSON.stringify(error)}`,
                ).catch(() => {
                    throw new Error("Error sending Firestore write operation failure email")
                })
            } else {
                console.log(JSON.stringify(error))
            }
        },
        async postLogout(errorDetails) {
            if (errorDetails.error) {
                for (const instance of errorDetails.instances) {
                    if (instance.code === "SIGN_OUT") {
                        setDialogContent({
                            title: "There was an error logging out",
                            description:
                                "You are still logged in. Please clear this browser's history to ensure that your sensitive data cannot be accessed by another user of this computer.",
                        })
                    } else if (instance.code === "CLEAR_CACHE") {
                        setDialogContent({
                            title: "There was an error clearing the cache",
                            description:
                                "Please clear this browser's history to ensure that your sensitive data cannot be accessed by another user of this computer.",
                        })
                    }
                }
            }
        },
        admin: {
            meta: {
                description: "A web app built using the Stoker platform.",
            },
            background: {
                light: {
                    color: "#1f4583",
                    image: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='105' viewBox='0 0 80 105'%3E%3Cg fill-rule='evenodd'%3E%3Cg id='death-star' fill='%233c66aa' fill-opacity='0.4'%3E%3Cpath d='M20 10a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V10zm15 35a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V45zM20 75a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V75zm30-65a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V10zm0 65a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V75zM35 10a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V10zM5 45a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V45zm0-35a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V10zm60 35a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V45zm0-35a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V10z' /%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                },
                dark: {
                    color: "#575757",
                    image: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='105' viewBox='0 0 80 105'%3E%3Cg fill-rule='evenodd'%3E%3Cg id='death-star' fill='%23454545' fill-opacity='0.4'%3E%3Cpath d='M20 10a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V10zm15 35a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V45zM20 75a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V75zm30-65a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V10zm0 65a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V75zM35 10a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V10zM5 45a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V45zm0-35a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V10zm60 35a5 5 0 0 1 10 0v50a5 5 0 0 1-10 0V45zm0-35a5 5 0 0 1 10 0v20a5 5 0 0 1-10 0V10z' /%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                },
            },
            menu: {
                groups: [
                    {
                        title: "Messages",
                        position: 1,
                        collections: ["Inbox", "Outbox"],
                    },
                ],
            },
            dashboard: [
                {
                    kind: "reminder",
                    collection: "Inbox",
                    columns: ["Sender", "Subject"],
                    title: "Unread Messages",
                    constraints: [["Status", "==", "Unread"]],
                },
                {
                    kind: "chart",
                    collection: "Inbox",
                    type: "area",
                    dateField: "Saved_At",
                    defaultRange: "30d",
                    title: "Messages Over Time",
                },
            ],
        },
    }
}

export default globalConfig

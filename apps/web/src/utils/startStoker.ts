import { CollectionSchema, DialogContent, StokerRecord } from "@stoker-platform/types"
import { initializeStoker } from "@stoker-platform/web-client"

export const startStoker = async (context: {
    setMaintenance: (maintenance: boolean) => void
    setDialogContent: (dialogContent: DialogContent | null) => void
    setConnectionStatus: (connectionStatus: "online" | "offline") => void
    setGlobalLoading: (operation: "+" | "-", id: string, server?: boolean, cache?: boolean) => void
    createRecordForm: (
        collection: CollectionSchema,
        collectionPath: string[],
        record?: StokerRecord,
    ) => false | React.ReactPortal
    toast: ({
        title,
        description,
        variant,
        duration,
    }: {
        title: string
        description: string
        variant?: "default" | "destructive" | null | undefined
        duration?: number
    }) => void
}) => {
    const globalConfig = await import("../assets/system-custom/main")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collectionModules: any = {}
    const collectionFiles = await import.meta.glob("../assets/system-custom/collections/*", { eager: true })
    for (const path in collectionFiles) {
        const moduleName = path.split("../assets/system-custom/collections/")[1].split(".")[0]
        // eslint-disable-next-line security/detect-object-injection
        collectionModules[moduleName] = collectionFiles[path]
    }

    const loggedIn = await initializeStoker(globalConfig, collectionModules, import.meta.env, context)

    return loggedIn
}

import { getFunctions, httpsCallable } from "firebase/functions"
import { getApp } from "firebase/app"
import { StokerRecord } from "@stoker-platform/types"
import { getEnv } from "../initializeStoker"

export const deleteFolder = async (path: string, record: StokerRecord, folderName: string) => {
    const app = getApp()
    const env = getEnv()
    const functions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const deleteFolderFunction = httpsCallable(functions, "stoker-deletefolder")

    await deleteFolderFunction({
        path: path || "",
        id: record.id,
        collectionPath: record.Collection_Path,
        folderName: folderName,
    })

    return
}

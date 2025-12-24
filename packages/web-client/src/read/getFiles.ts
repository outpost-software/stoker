import { getFunctions, httpsCallable } from "firebase/functions"
import { StokerRecord, StorageItem } from "@stoker-platform/types"
import { getApp } from "firebase/app"
import { getEnv } from "../main"

export const getFiles = async (path: string, record: StokerRecord) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const getFilesApi = httpsCallable(firebaseFunctions, `stoker-getfiles`)
    const getFilesResult = await getFilesApi({
        collectionPath: record.Collection_Path,
        id: record.id,
        path,
    })
    const data = getFilesResult.data as { result: StorageItem[] }
    return data.result
}

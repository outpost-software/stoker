import { getFunctions, httpsCallable } from "firebase/functions"
import { StokerRecord } from "@stoker-platform/types"
import { getApp } from "firebase/app"
import { getEnv } from "../initializeStoker"

export const deleteRecordServer = async (path: string[], id: string) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const deleteRecordApi = httpsCallable(firebaseFunctions, "stoker-writeapi", { timeout: 9 * 60 * 1000 })
    const deleteRecordResult = await deleteRecordApi({
        operation: "delete",
        path,
        id,
    })
    const data = deleteRecordResult.data as { result: StokerRecord }
    return data?.result
}

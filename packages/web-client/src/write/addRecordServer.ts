import { getFunctions, httpsCallable } from "firebase/functions"
import { StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { serializeTimestamps } from "../utils/serializeTimestamps"
import { getApp } from "firebase/app"
import { getEnv } from "../initializeStoker"

export const addRecordServer = async (
    path: string[],
    record: Partial<StokerRecord>,
    user?: { permissions?: StokerPermissions; password: string },
    id?: string,
) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const addRecordApi = httpsCallable(firebaseFunctions, "stoker-writeapi", { timeout: 9 * 60 * 1000 })
    serializeTimestamps(record)
    const addRecordResult = await addRecordApi({
        operation: "create",
        path,
        record,
        user,
        id,
    })
    const data = addRecordResult.data as { result: StokerRecord }
    return data?.result
}

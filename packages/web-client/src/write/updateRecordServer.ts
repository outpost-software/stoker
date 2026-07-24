import { getFunctions, httpsCallable } from "firebase/functions"
import { StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { serializeTimestamps } from "../utils/serializeTimestamps"
import { serializeDeleteSentinels } from "../utils/serializeDeleteSentinels"
import { getEnv } from "../initializeStoker"
import { getApp } from "firebase/app"
import cloneDeep from "lodash/cloneDeep.js"

export const updateRecordServer = async (
    path: string[],
    id: string,
    record: Partial<StokerRecord>,
    user?: { operation: string; permissions?: StokerPermissions; password?: string },
) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const updateRecordApi = httpsCallable(firebaseFunctions, "stoker-writeapi", { timeout: 9 * 60 * 1000 })
    const serializedRecord = cloneDeep(record)
    serializeTimestamps(serializedRecord)
    serializeDeleteSentinels(serializedRecord)
    const updateRecordResult = await updateRecordApi({
        operation: "update",
        path,
        id,
        record: serializedRecord,
        user,
    })
    const data = updateRecordResult.data as { result: StokerRecord }
    return data?.result
}

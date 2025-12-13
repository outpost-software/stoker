import { httpsCallable, getFunctions } from "firebase/functions"
import { getApp } from "firebase/app"
import { getEnv } from "../initializeStoker"
import { StokerRecord } from "@stoker-platform/types"
import { deserializeTimestamps } from "../utils/deserializeTimestamps"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getOneServer = async (path: string[], id?: string, options?: any) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const getOneApi = httpsCallable(firebaseFunctions, `stoker-readapi`)
    const getOneResult = await getOneApi({
        path,
        id,
        options,
    })
    const data = getOneResult.data as { result: StokerRecord }
    const doc = data.result
    deserializeTimestamps(doc)
    return doc
}

import { getEnv } from "../main"
import { getApp } from "firebase/app"
import { getFunctions, httpsCallable } from "firebase/functions"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const callFunction = async (functionName: string, payload: Record<string, any>) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const api = httpsCallable(firebaseFunctions, functionName)
    const result = await api(payload)
    return result.data
}

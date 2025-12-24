import { httpsCallable, getFunctions } from "firebase/functions"
import { getApp } from "firebase/app"
import { getEnv } from "../main"

export const sendAdminSMS = async (body: string) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const sendAdminSMSApi = httpsCallable(firebaseFunctions, "stoker-adminsms")
    await sendAdminSMSApi({
        body,
    })
    return
}

import { httpsCallable, getFunctions } from "firebase/functions"
import { getApp } from "firebase/app"
import { getEnv } from "../main"

export const sendAdminEmail = async (
    subject: string,
    text?: string,
    html?: string,
    cc?: string | string[],
    bcc?: string | string[],
    replyTo?: string,
) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
    const sendAdminEmailApi = httpsCallable(firebaseFunctions, "stoker-adminemail")
    await sendAdminEmailApi({
        subject,
        text,
        html,
        cc,
        bcc,
        replyTo,
    })
    return
}

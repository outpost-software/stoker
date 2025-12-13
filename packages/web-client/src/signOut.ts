import { tryPromise } from "@stoker-platform/utils"
import { getGlobalConfigModule } from "./initializeStoker"
import { getAuth } from "firebase/auth"

export const signOut = async () => {
    const globalConfig = getGlobalConfigModule()
    const auth = getAuth()
    const user = auth.currentUser

    if (globalConfig.preLogout) {
        const preLogoutValue = await tryPromise(globalConfig.preLogout, [user])
        if (preLogoutValue === false) {
            throw new Error("Operation cancelled by preLogout")
        }
    }

    try {
        auth.signOut()
    } catch (error) {
        console.error(error)
        const signOutError = { error: true, instances: [{ instance: "[DEFAULT]", code: "SIGN_OUT", error: error }] }
        await tryPromise(globalConfig.postLogout, [signOutError])
    }
    return
}

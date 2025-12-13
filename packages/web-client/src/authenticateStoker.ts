import {
    getAuth,
    getMultiFactorResolver,
    signInWithCustomToken,
    signInWithEmailAndPassword,
    signOut,
    TotpMultiFactorGenerator,
} from "firebase/auth"
import { getEnv, getFirestoreWriteAuth, getGlobalConfigModule } from "./initializeStoker"
import { tryPromise } from "@stoker-platform/utils"
import { getApp } from "firebase/app"
import { getFunctions, httpsCallable } from "firebase/functions"

export const authenticateStoker = async (
    email: string,
    password: string,
    getMultiFactorTOTP?: () => Promise<string>,
) => {
    const [authInstance, firestoreWriteAuthInstance] = [getAuth(), getFirestoreWriteAuth()]
    const globalConfig = getGlobalConfigModule()

    if (!email || !password) {
        throw new Error("Email and password are required.")
    }
    try {
        let userId: string | undefined
        let otpFromAuthenticator: string

        if (!authInstance.currentUser) {
            try {
                const firebaseUser = await signInWithEmailAndPassword(authInstance, email, password)
                userId = firebaseUser.user.uid
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                if (error.code === "auth/multi-factor-auth-required") {
                    if (getMultiFactorTOTP) {
                        otpFromAuthenticator ||= await getMultiFactorTOTP()
                        const multiFactorResolver = getMultiFactorResolver(authInstance, error)
                        const multiFactorAssertion = TotpMultiFactorGenerator.assertionForSignIn(
                            multiFactorResolver.hints[0].uid,
                            otpFromAuthenticator,
                        )
                        const firebaseUser = await multiFactorResolver.resolveSignIn(multiFactorAssertion)
                        userId = firebaseUser.user.uid
                    } else throw new Error("TOTP retrieval function not found.")
                } else {
                    throw error
                }
            }
        } else {
            userId = authInstance.currentUser?.uid
        }

        if (!firestoreWriteAuthInstance.currentUser) {
            const app = getApp()
            const env = getEnv()
            const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
            const customTokenApi = httpsCallable(firebaseFunctions, "stoker-customtoken")
            try {
                const customTokenResult = await customTokenApi()
                const customToken = (customTokenResult.data as { customToken: string }).customToken
                if (!customToken) throw new Error("The user is not authenticated.")
                await signInWithCustomToken(firestoreWriteAuthInstance, customToken)
            } catch {
                if (authInstance && authInstance.currentUser) {
                    await signOut(authInstance)
                }
                throw new Error("The user is not authenticated.")
            }
        }

        console.info(`${userId} successfully logged in.`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        await tryPromise(globalConfig.postLogin, [null, error])
        throw error
    }

    return
}

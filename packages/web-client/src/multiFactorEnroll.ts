import { multiFactor, TotpMultiFactorGenerator, TotpSecret, User } from "firebase/auth"
import { getGlobalConfigModule } from "./initializeStoker"
import { getCachedConfigValue } from "@stoker-platform/utils"

export const multiFactorEnroll = async (
    user: User,
    getMultiFactorCode: (secret: string, totpUri: string) => Promise<string>,
) => {
    if (user.email) {
        const globalConfig = getGlobalConfigModule()
        const appName = await getCachedConfigValue(globalConfig, ["global", "appName"])
        const multiFactorSession = await multiFactor(user)
            .getSession()
            .catch((error) => {
                throw new Error("Error getting multi-factor session.", { cause: error })
            })
        let totpSecret: TotpSecret
        try {
            totpSecret = await TotpMultiFactorGenerator.generateSecret(multiFactorSession)
        } catch (error) {
            if (error instanceof Error && error.message.includes("requires-recent-login")) {
                alert("Please sign in again to enroll in multi-factor authentication.")
                return
            }
            throw new Error("Error generating multi-factor secret.", { cause: error })
        }
        const secret = totpSecret.secretKey
        const totpUri = totpSecret.generateQrCodeUrl(user.email, appName)
        const verificationCode = await getMultiFactorCode(secret, totpUri).catch((error) => {
            throw new Error("Error getting multi-factor code.", { cause: error })
        })
        const multiFactorAssertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, verificationCode)
        await multiFactor(user)
            .enroll(multiFactorAssertion, appName)
            .catch((error) => {
                throw new Error("Error enrolling in multi-factor authentication.", { cause: error })
            })
    } else {
        throw new Error("User must have an email address to enroll in multi-factor authentication.")
    }
}

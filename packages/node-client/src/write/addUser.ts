import { GlobalConfig, StokerCollection, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { tryPromise } from "@stoker-platform/utils"
import { getFirestore } from "firebase-admin/firestore"
import { deleteUser } from "./deleteUser"
import { getAuth } from "firebase-admin/auth"
import { sendMail } from "../utils/sendMail"

export const addUser = async (
    tenantId: string,
    docId: string,
    globalConfig: GlobalConfig,
    collection: StokerCollection,
    record: StokerRecord,
    permissions: StokerPermissions,
    password: string,
) => {
    const auth = getAuth()
    const db = getFirestore()

    const message = "USER_ERROR"

    const rollback = async (record: StokerRecord, message: string) => {
        try {
            await deleteUser(record)
        } catch {
            throw new Error(`ROLLBACK_FAILED: ${message}`)
        }
        return
    }

    let user

    try {
        user = await auth.createUser({
            email: record.Email,
            emailVerified: false,
            password: password,
            displayName: record.Name,
            photoURL: record.Photo_URL,
            disabled: !record.Enabled,
        })
    } catch {
        throw new Error(message)
    }

    try {
        await auth.setCustomUserClaims(user.uid, {
            tenant: tenantId,
            role: record.Role,
            collection,
            doc: docId,
        })
    } catch {
        await rollback(record, message)
        throw new Error(message)
    }

    try {
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("system_user_permissions")
            .doc(user.uid)
            .set({
                ...permissions,
                Role: record.Role,
                Enabled: record.Enabled ?? false,
                Collection: collection,
                Doc_ID: docId,
            })
    } catch {
        await rollback(record, message)
        throw new Error(message)
    }

    const multiFactorAuth = globalConfig.auth.enableMultiFactorAuth
    if (multiFactorAuth === true || (typeof multiFactorAuth === "object" && multiFactorAuth.includes(record.Role))) {
        let verificationParams: string | undefined
        try {
            verificationParams = await auth.generateEmailVerificationLink(record.Email)
        } catch {
            await rollback(record, message)
            throw new Error(message)
        }
        if (verificationParams.includes("apiKey=&")) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const firebaseConfig = JSON.parse(process.env.STOKER_FB_WEB_APP_CONFIG!)
            verificationParams = verificationParams.replace("apiKey=&", `apiKey=${firebaseConfig.apiKey}&`)
        }
        if (verificationParams) {
            const verificationLink = `https://${auth.app.options.projectId}.firebaseapp.com/__/auth/action${verificationParams}`
            const appName = await tryPromise(globalConfig.appName)
            const email =
                globalConfig?.mail?.emailVerification && globalConfig.mail.emailVerification(verificationLink, appName)

            try {
                await sendMail(
                    record.Email,
                    email?.subject || "Please verify your email address",
                    undefined,
                    email?.html ||
                        `Please verify your email address by clicking the link:
                        </br>
                        </br>
                        <a href="${verificationLink}">${verificationLink}</a>`,
                )
            } catch {
                await rollback(record, message)
                throw new Error(message)
            }
        }
    }

    return user.uid
}

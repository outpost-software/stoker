import { GlobalConfig, StokerCollection, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { tryPromise } from "@stoker-platform/utils"
import { getAuth, UserRecord } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { addUser } from "./addUser.js"
import { rollbackUser } from "./rollbackUser.js"
import { deleteUser } from "./deleteUser.js"
import { sendMail } from "../utils/sendMail.js"

export const updateUser = async (
    operation: "create" | "update" | "delete",
    tenantId: string,
    docId: string,
    globalConfig: GlobalConfig,
    collection: StokerCollection,
    record: StokerRecord,
    originalRecord: StokerRecord,
    originalUser?: UserRecord,
    permissions?: StokerPermissions,
    originalPermissions?: StokerPermissions,
    password?: string,
) => {
    const auth = getAuth()
    const db = getFirestore()

    const claims = originalUser?.customClaims || {}

    const message = "USER_ERROR"

    let uid = ""

    if (operation === "create") {
        if (!password) {
            throw new Error("VALIDATION_ERROR: Password is required")
        }
        if (!permissions) {
            throw new Error("VALIDATION_ERROR: Permissions are required")
        }
        try {
            uid = await addUser(tenantId, docId, globalConfig, collection, record, permissions, password)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            throw new Error(error.message)
        }
    } else if (operation === "update") {
        if (!originalPermissions || !originalUser) {
            throw new Error("USER_ERROR")
        }

        const updateDetails: Record<string, string | boolean | undefined> = {}
        if (originalRecord.Name !== record.Name) {
            updateDetails.displayName = record.Name as string
        }
        if (originalRecord.Email !== record.Email) {
            updateDetails.email = record.Email as string
            updateDetails.emailVerified = false
        }
        if (originalRecord.Photo_URL !== record.Photo_URL) {
            updateDetails.photoURL = record.Photo_URL ? (record.Photo_URL as string) : undefined
        }
        if (originalRecord.Enabled !== record.Enabled) {
            updateDetails.disabled = !record.Enabled as boolean
        }
        if (password) {
            updateDetails.password = password
        }
        if (Object.keys(updateDetails).length) {
            try {
                await auth.updateUser(originalRecord.User_ID, updateDetails)
                if (updateDetails.disabled === true) {
                    await auth.revokeRefreshTokens(originalRecord.User_ID)
                }
            } catch {
                await rollbackUser(originalRecord.User_ID, originalUser, originalPermissions, message)
                throw new Error(message)
            }
        }

        if (record.Role && record.Role !== originalRecord.Role) {
            try {
                await auth.setCustomUserClaims(originalRecord.User_ID, {
                    ...claims,
                    role: record.Role,
                })
                await auth.revokeRefreshTokens(originalRecord.User_ID)
            } catch {
                await rollbackUser(originalRecord.User_ID, originalUser, originalPermissions, message)
                throw new Error(message)
            }
        }

        try {
            await db
                .collection("tenants")
                .doc(tenantId)
                .collection("system_user_permissions")
                .doc(originalRecord.User_ID)
                .set({
                    ...(permissions || originalPermissions),
                    Collection: claims.collection,
                    Doc_ID: claims.doc,
                    Role: record.Role,
                    Enabled: record.Enabled ?? originalRecord.Enabled ?? false,
                })
        } catch {
            await rollbackUser(originalRecord.User_ID, originalUser, originalPermissions, message)
            throw new Error(message)
        }

        if (originalRecord.Email !== record.Email) {
            const multiFactorAuth = globalConfig.auth.enableMultiFactorAuth
            if (
                multiFactorAuth === true ||
                (typeof multiFactorAuth === "object" && multiFactorAuth.includes(record.Role))
            ) {
                let verificationParams = await auth.generateEmailVerificationLink(record.Email).catch(() => {
                    throw new Error("Error generating email verification link")
                })
                if (verificationParams.includes("apiKey=&")) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const firebaseConfig = JSON.parse(process.env.STOKER_FB_WEB_APP_CONFIG!)
                    verificationParams = verificationParams.replace("apiKey=&", `apiKey=${firebaseConfig.apiKey}&`)
                }
                if (verificationParams) {
                    const verificationLink = `https://${auth.app.options.projectId}.firebaseapp.com/__/auth/action${verificationParams}`
                    const appName = await tryPromise(globalConfig.appName)
                    const email =
                        globalConfig?.mail?.emailVerification &&
                        globalConfig.mail.emailVerification(verificationLink, appName)

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
                        await rollbackUser(originalRecord.User_ID, originalUser, originalPermissions, message)
                        throw new Error(message)
                    }
                }
            }
        }
    } else if (operation === "delete") {
        try {
            await deleteUser(originalRecord)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            throw new Error(error.message)
        }
    }

    if (uid) {
        return uid
    }
    return
}

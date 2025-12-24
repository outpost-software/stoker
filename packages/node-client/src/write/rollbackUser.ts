import { UserRecord, getAuth } from "firebase-admin/auth"
import { StokerPermissions } from "@stoker-platform/types"
import { getFirestore } from "firebase-admin/firestore"
import { getTenant } from "../initializeStoker"

export const rollbackUser = async (
    id: string,
    originalUser: UserRecord,
    originalPermissions: StokerPermissions,
    message: string,
) => {
    const tenantId = getTenant()
    const auth = getAuth()
    const db = getFirestore()
    const claims = originalUser.customClaims || {}

    let rollbackError = false

    try {
        await auth.updateUser(id, {
            email: originalUser.email,
            disabled: originalUser.disabled,
            displayName: originalUser.displayName,
            photoURL: originalUser.photoURL,
            emailVerified: !!originalUser.emailVerified,
        })
    } catch {
        rollbackError = true
    }

    try {
        await auth.setCustomUserClaims(id, {
            ...claims,
        })
    } catch {
        rollbackError = true
    }

    try {
        await db
            .collection("tenants")
            .doc(tenantId)
            .collection("system_user_permissions")
            .doc(id)
            .update({
                ...originalPermissions,
                Collection: claims.collection,
                Doc_ID: claims.doc,
                Role: claims.role,
                Enabled: !originalUser.disabled,
            })
    } catch {
        rollbackError = true
    }

    if (rollbackError) {
        throw new Error(`ROLLBACK_FAILED: ${message}`)
    }
    return
}

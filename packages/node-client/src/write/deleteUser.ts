import { StokerRecord } from "@stoker-platform/types"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { getTenant } from "../initializeStoker"

export const deleteUser = async (record: StokerRecord) => {
    const tenantId = getTenant()
    const auth = getAuth()
    const db = getFirestore()

    const errors: string[] = []

    await Promise.all([
        (async () => {
            try {
                await db
                    .collection("tenants")
                    .doc(tenantId)
                    .collection("system_user_permissions")
                    .doc(record.User_ID)
                    .delete()
            } catch (error) {
                errors.push(`Error deleting user permissions:\n${error}`)
            }
        })(),
        (async () => {
            try {
                await auth.deleteUser(record.User_ID)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                if (error.code === "auth/user-not-found") {
                    return
                }
                errors.push(`Error deleting user:\n${error}`)
            }
        })(),
    ])

    if (errors.length > 0) {
        throw new Error(errors.join(", "))
    }

    return
}

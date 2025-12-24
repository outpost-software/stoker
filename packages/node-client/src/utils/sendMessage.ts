import { getFirestore } from "firebase-admin/firestore"
import { getMode } from "../initializeStoker"

export const sendMessage = async (to: string, body: string) => {
    const db = getFirestore()
    const mode = getMode()
    const adminPhone = process.env.ADMIN_SMS
    if (mode === "development") {
        if (adminPhone) {
            to = adminPhone
        } else {
            throw new Error("Admin phone not set")
        }
    }
    const message: {
        to: string
        body: string
    } = { to, body }
    await db.collection("system_messages").add(message)
    return
}

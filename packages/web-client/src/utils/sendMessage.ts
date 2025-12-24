import { addDoc, collection, getFirestore } from "firebase/firestore"
import { getEnv } from "../initializeStoker"
import { sendAdminSMS } from "./sendAdminSMS"

export const sendMessage = async (to: string, body: string) => {
    const env = getEnv()
    const mode = env.MODE
    if (mode === "development") {
        await sendAdminSMS(body)
        return
    }
    const db = getFirestore()
    const message: {
        to: string
        body: string
    } = { to, body }
    await addDoc(collection(db, "system_messages"), message)
    return
}

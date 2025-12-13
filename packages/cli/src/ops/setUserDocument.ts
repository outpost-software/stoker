import { initializeFirebase } from "@stoker-platform/node-client"
import { getAuth } from "firebase-admin/auth"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setUserDocument = async (options: any) => {
    await initializeFirebase()
    const auth = getAuth()
    const user = await auth.getUser(options.id)
    await auth.setCustomUserClaims(options.id, { ...user.customClaims, doc: options.doc })
    console.log("User document updated successfully.")
    process.exit()
}

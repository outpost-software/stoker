import { initializeFirebase } from "@stoker-platform/node-client"
import { getCLIFirestore } from "../utils/getCLIFirestore.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getUserPermissions = async (options: any) => {
    await initializeFirebase()
    const db = getCLIFirestore()
    const usersRef = await db
        .collection("tenants")
        .doc(options.tenant)
        .collection("system_user_permissions")
        .doc(options.id)
        .get()
    if (!usersRef.exists) {
        console.log("User not found")
        process.exit()
    }
    console.log(JSON.stringify(usersRef.data()))
    process.exit()
}

import { initializeStoker } from "@stoker-platform/node-client"
import { getFirestore } from "firebase-admin/firestore"
import { join } from "node:path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getUserPermissions = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )
    const db = getFirestore()
    const usersRef = await db.collection("system_user_permissions").doc(options.id).get()
    if (!usersRef.exists) {
        console.log("User not found")
        process.exit()
    }
    console.log(JSON.stringify(usersRef.data()))
    process.exit()
}

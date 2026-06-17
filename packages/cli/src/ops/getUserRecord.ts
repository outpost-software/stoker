import { initializeFirebase } from "@stoker-platform/node-client"
import { getCLIFirestore } from "../utils/getCLIFirestore.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getUserRecord = async (options: any) => {
    await initializeFirebase()
    const db = getCLIFirestore()
    const usersRef = await db
        .collection("tenants")
        .doc(options.tenant)
        .collection(options.collection)
        .where("User_ID", "==", options.id)
        .get()
    if (usersRef.empty) {
        console.log("User not found")
        process.exit()
    }
    const user = usersRef.docs[0].data()
    console.log(JSON.stringify(user))
    process.exit()
}

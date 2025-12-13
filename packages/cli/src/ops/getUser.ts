import { initializeFirebase } from "@stoker-platform/node-client"
import { getAuth } from "firebase-admin/auth"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getUser = async (options: any) => {
    await initializeFirebase()
    const auth = getAuth()
    const user = await auth.getUser(options.id)
    console.log(JSON.stringify(user))
    process.exit()
}

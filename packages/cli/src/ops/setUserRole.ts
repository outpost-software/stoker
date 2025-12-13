import { fetchCurrentSchema, initializeFirebase } from "@stoker-platform/node-client"
import { getAuth } from "firebase-admin/auth"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setUserRole = async (options: any) => {
    await initializeFirebase()
    const schema = await fetchCurrentSchema()
    if (!schema.config.roles.includes(options.role)) throw new Error(`Role "${options.role}" does not exist.`)
    const auth = getAuth()
    const user = await auth.getUser(options.id)
    await auth.setCustomUserClaims(options.id, { ...user.customClaims, role: options.role })
    console.log("User role updated successfully.")
    process.exit()
}

import { fetchCurrentSchema, initializeFirebase } from "@stoker-platform/node-client"
import { getAuth } from "firebase-admin/auth"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setUserCollection = async (options: any) => {
    await initializeFirebase()
    const schema = await fetchCurrentSchema()
    if (!Object.keys(schema.collections).includes(options.collection))
        throw new Error(`Collection "${options.collection}" does not exist.`)
    const auth = getAuth()
    const user = await auth.getUser(options.id)
    await auth.setCustomUserClaims(options.id, { ...user.customClaims, collection: options.collection })
    console.log("User collection updated successfully.")
    process.exit()
}

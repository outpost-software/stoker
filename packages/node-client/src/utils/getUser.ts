import { getAuth } from "firebase-admin/auth"

export const getUser = async (id: string) => {
    const auth = getAuth()
    const user = await auth.getUser(id)
    return user
}

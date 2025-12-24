import { IdTokenResult, User } from "firebase/auth"
import { Unsubscribe, doc, getFirestore, onSnapshot } from "firebase/firestore"
import { StokerPermissions } from "@stoker-platform/types"
import { getGlobalConfigModule, getTenant, signOut } from "../main"
import isEqual from "lodash/isEqual.js"
import { preloadCollection } from "./cache/preloadCollection"

let permissions: StokerPermissions | null = null

export const initializeUserListeners = async (user: User, idTokenResult: IdTokenResult): Promise<Unsubscribe[]> => {
    const listeners: Unsubscribe[] = []
    const tenantId = getTenant()
    const db = getFirestore()
    const globalConfig = getGlobalConfigModule()
    if (!idTokenResult.claims.doc) throw new Error("User document ID not found in claims")

    let permissionsInitialized = false
    let previousPermissions: StokerPermissions | null = null

    const permissionsPromise = () => {
        return new Promise<void>((resolve, reject) => {
            const permissionsListener = onSnapshot(
                doc(db, "tenants", tenantId, "system_user_permissions", user.uid),
                (snapshot): void => {
                    if (snapshot.exists()) {
                        permissions = snapshot.data() as StokerPermissions
                        permissions.User_ID = snapshot.id
                        if (!permissions.Role) throw new Error("PERMISSION_DENIED")
                        if (!permissionsInitialized) {
                            permissionsInitialized = true
                            resolve()
                        } else {
                            const event = new Event("stoker:permissionsChange")
                            document.dispatchEvent(event)
                            if (globalConfig.auth.signOutOnPermissionsChange) {
                                signOut()
                            } else {
                                const permissionCollections = permissions.collections
                                if (permissionCollections) {
                                    for (const [key, permission] of Object.entries(permissionCollections)) {
                                        if (
                                            previousPermissions &&
                                            // eslint-disable-next-line security/detect-object-injection
                                            (!previousPermissions.collections?.[key] ||
                                                // eslint-disable-next-line security/detect-object-injection
                                                !isEqual(permission, previousPermissions.collections[key]))
                                        ) {
                                            preloadCollection(key)
                                        }
                                    }
                                }
                            }
                        }
                        previousPermissions = permissions
                    } else {
                        reject(new Error("Permissions not found"))
                    }
                },
                (error): void => {
                    reject(new Error(`Error getting permissions for user ${user.uid}`, { cause: error }))
                },
            )
            listeners.push(permissionsListener)
        })
    }

    await permissionsPromise()

    return listeners
}

export const getCurrentUserPermissions = () => permissions
export const clearCurrentUser = () => {
    permissions = null
}

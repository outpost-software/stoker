import type { StokerPermissions } from "@stoker-platform/types"
import { resolveProject } from "./config/project.js"
import { getAuth } from "firebase-admin/auth"
import { getDatabase } from "firebase-admin/database"
import { Algoliasearch, algoliasearch } from "algoliasearch"
import { getStokerFirestore, initializeFirebase, initializeStoker } from "@stoker-platform/node-client"
import { join } from "node:path"

const project = resolveProject()
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${project.ports.auth}`
process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${project.ports.database}`
process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${project.ports.firestore}`
process.env.FIREBASE_STORAGE_EMULATOR_HOST = `127.0.0.1:${project.ports.storage}`
let isInitialized = false
let tenantId: string | undefined

export const waitForSchemaIndex = async (timeoutMs = 180000): Promise<void> => {
    const deadline = Date.now() + timeoutMs
    let lastError: unknown
    while (Date.now() < deadline) {
        try {
            const rtdb = getDatabase()
            await rtdb.ref("schema").orderByChild("published_time").limitToLast(1).get()
            return
        } catch (error) {
            lastError = error
            const message = error instanceof Error ? error.message : String(error)
            if (!message.includes("Index not defined")) throw error
            await new Promise((done) => setTimeout(done, 500))
        }
    }
    throw lastError
}

export const setUserPassword = async (email: string, password: string): Promise<void> => {
    const auth = getAuth()
    const user = await auth.getUserByEmail(email)
    if (!user) {
        throw new Error(`User "${email}" not found.`)
    }
    await auth.updateUser(user.uid, { password, emailVerified: true })
}

const indexNames = async (client: Algoliasearch): Promise<string[]> => {
    const names: string[] = []
    let page = 0
    for (;;) {
        const response = await client.listIndices({ page, hitsPerPage: 100 })
        names.push(...response.items.map((item) => item.name))
        page += 1
        if (page >= (response.nbPages ?? 1)) return names
    }
}

export const clearTenantAlgolia = async (): Promise<void> => {
    const appId = process.env.ALGOLIA_ID
    if (!appId || !process.env.ALGOLIA_ADMIN_KEY) return

    const client = algoliasearch(appId, process.env.ALGOLIA_ADMIN_KEY)
    const filter = `tenant_id:${tenantId}`

    for (const indexName of await indexNames(client)) {
        const { taskID } = await client.deleteBy({ indexName, deleteByParams: { filters: filter } })
        await client.waitForTask({ indexName, taskID })
    }
}

export const getTenant = (): string => {
    if (!tenantId) throw new Error("Tenant not initialized.")
    return tenantId
}

export const getCurrentUser = async (role: string) => {
    // eslint-disable-next-line security/detect-object-injection
    const fixtureUser = project.users[role]
    const auth = getAuth()
    const user = await auth.getUserByEmail(fixtureUser.email)
    return user
}

export const getCurrentUserPermissions = async (role: string) => {
    const user = await getCurrentUser(role)
    if (!user) throw new Error(`User "${role}" not found.`)
    const userId = user.uid
    const tenantId = getTenant()
    const db = getStokerFirestore()
    const snapshot = await db
        .collection("tenants")
        .doc(tenantId)
        .collection("system_user_permissions")
        .doc(userId)
        .get()
    const permissions = snapshot.data() as StokerPermissions | undefined
    if (!permissions) throw new Error(`No permissions record for user "${userId}".`)
    return permissions
}

export const start = async () => {
    if (isInitialized) return
    await initializeFirebase()
    await waitForSchemaIndex()
    const db = getStokerFirestore()
    const tenants = await db.collection("tenants").get()
    tenantId = tenants.docs[0].id

    await initializeStoker(
        "development",
        tenantId,
        join(project.rootDir, "lib", "main.js"),
        join(project.rootDir, "lib", "collections"),
    )

    isInitialized = true
}

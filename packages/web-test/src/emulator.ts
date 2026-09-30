import { getApps, initializeApp } from "firebase-admin"
import type { StokerProject } from "./project.js"
import { getFirestoreDatabaseId } from "@stoker-platform/utils"
import { getFirestore } from "firebase-admin/firestore"

const HOST = "127.0.0.1"
const OWNER = "Bearer owner"

interface EmulatorAccount {
    localId: string
    customAttributes?: string
}

const authRequest = async <T>(project: StokerProject, method: string, body: unknown): Promise<T> => {
    const base = `http://${HOST}:${project.ports.auth}/identitytoolkit.googleapis.com/v1/projects/${project.firebaseProjectId}`
    const response = await fetch(`${base}/accounts:${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: OWNER },
        body: JSON.stringify(body),
    })
    if (!response.ok)
        throw new Error(`Auth emulator accounts:${method} failed: ${response.status} ${await response.text()}`)
    return (await response.json()) as T
}

const lookupByEmail = async (project: StokerProject, email: string): Promise<EmulatorAccount | undefined> => {
    const body = await authRequest<{ users?: EmulatorAccount[] }>(project, "lookup", { email: [email] })
    return body.users?.[0]
}

export const ensureTestUser = async (project: StokerProject, email: string, password: string): Promise<void> => {
    const account = await lookupByEmail(project, email)
    if (!account) {
        throw new Error(`No user "${email}" in the Auth emulator.`)
    }
    await authRequest(project, "update", { localId: account.localId, password, emailVerified: true })
}

export const getUserRole = async (project: StokerProject, email: string): Promise<string | undefined> => {
    const account = await lookupByEmail(project, email)
    return account?.customAttributes ? (JSON.parse(account.customAttributes) as { role?: string }).role : undefined
}

export const waitForCallable = async (project: StokerProject, name: string, timeoutMs = 180000): Promise<void> => {
    const url = `http://${HOST}:${project.ports.functions}/${project.firebaseProjectId}/${project.functionsRegion}/${name}`
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        })
        if (response.status !== 404) return
        await new Promise((done) => setTimeout(done, 500))
    }

    throw new Error(`The Functions emulator did not register "${name}" within ${timeoutMs}ms.`)
}

export const emulatorFirestore = async (project: StokerProject) => {
    process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${project.ports.firestore}`
    const app =
        getApps().find((item) => item.name === "web-test") ??
        initializeApp({ projectId: project.firebaseProjectId }, "web-test")
    const databaseId = getFirestoreDatabaseId(
        process.env.STOKER_FB_FIRESTORE_EDITION ?? process.env.FB_FIRESTORE_EDITION,
        project.firebaseProjectId,
    )
    const firestore = databaseId === "(default)" ? getFirestore(app) : getFirestore(app, databaseId)
    const tenants = await firestore.collection("tenants").get()
    return firestore.collection("tenants").doc(tenants.docs[0].id)
}

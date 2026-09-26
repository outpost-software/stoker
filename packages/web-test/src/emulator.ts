import type { StokerProject } from "./project.js"

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

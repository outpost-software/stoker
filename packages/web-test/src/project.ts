import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import dotenv from "dotenv"

const EMULATORS = ["auth", "firestore", "database", "storage", "functions"] as const

const DEFAULT_PORTS: StokerEmulatorPorts = {
    auth: 9099,
    firestore: 8080,
    database: 9000,
    storage: 9199,
    functions: 5001,
}

/** Credentials for a single test user */
export interface StokerTestUser {
    email: string
    password: string
}

/** Ports for the Firebase emulators the web app connects to */
export type StokerEmulatorPorts = Record<(typeof EMULATORS)[number], number>

export interface StokerProjectOptions {
    /** The root of the Stoker project. Defaults to the current working directory */
    rootDir?: string
    /** The origin the web app dev server is served from. Defaults to `http://localhost:5173` */
    baseURL?: string
    /** Test users keyed by role */
    users?: Record<string, StokerTestUser>
    /** Emulator ports */
    ports?: Partial<StokerEmulatorPorts>
}

/** A resolved Stoker project, describing everything the web tests need to locate and talk to it */
export interface StokerProject {
    rootDir: string
    baseURL: string
    projectDataPath: string
    firebaseProjectId: string
    functionsRegion: string
    ports: StokerEmulatorPorts
    users: Record<string, StokerTestUser>
}

// eslint-disable-next-line security/detect-non-literal-fs-filename
const readJSON = (path: string): unknown => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined)

export const firebaseEmulators = (rootDir: string): Record<string, { port?: number }> => {
    const firebaseJSON = readJSON(join(rootDir, "firebase.json")) as { emulators?: Record<string, { port?: number }> }
    return firebaseJSON?.emulators ?? {}
}

const loadEnvFiles = (rootDir: string) => {
    const envDir = join(rootDir, ".env")
    const gcpProject = process.env.GCP_PROJECT
    if (gcpProject) dotenv.config({ path: join(envDir, `.env.${gcpProject}`), quiet: true })
    const projectEnvFile = join(envDir, `.env.project.${gcpProject}`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (gcpProject && existsSync(projectEnvFile)) dotenv.config({ path: projectEnvFile, quiet: true })
    else dotenv.config({ path: join(envDir, ".env"), quiet: true })
}

const resolvePorts = (rootDir: string, provided: Partial<StokerEmulatorPorts> = {}): StokerEmulatorPorts => {
    const declared = firebaseEmulators(rootDir)
    const published = JSON.parse(process.env.STOKER_TEST_PORTS ?? "{}") as Partial<StokerEmulatorPorts>
    const entries = EMULATORS.map((name) => {
        const fromEnv = process.env[`STOKER_FB_EMULATOR_${name.toUpperCase()}_PORT`]
        const port =
            // eslint-disable-next-line security/detect-object-injection
            provided[name] ??
            // eslint-disable-next-line security/detect-object-injection
            published[name] ??
            (fromEnv ? parseInt(fromEnv) : undefined) ??
            // eslint-disable-next-line security/detect-object-injection
            declared[name]?.port ??
            // eslint-disable-next-line security/detect-object-injection
            DEFAULT_PORTS[name]
        return [name, port]
    })
    return Object.fromEntries(entries) as StokerEmulatorPorts
}

const resolveUsers = (rootDir: string, provided?: Record<string, StokerTestUser>): Record<string, StokerTestUser> => {
    if (provided) return provided
    if (process.env.STOKER_TEST_USERS)
        return JSON.parse(process.env.STOKER_TEST_USERS) as Record<string, StokerTestUser>
    const file = readJSON(join(rootDir, "stoker-test.json")) as { users?: Record<string, StokerTestUser> } | undefined
    return file?.users ?? {}
}

const resolveFirebaseProjectId = (): string => {
    const webAppConfig = process.env.STOKER_FB_WEB_APP_CONFIG
    const projectId = webAppConfig ? JSON.parse(webAppConfig).projectId : undefined
    const resolved = projectId ?? process.env.GCP_PROJECT
    if (!resolved) throw new Error("Could not resolve a Firebase project ID")
    return resolved
}

export const publishProject = (project: StokerProject): void => {
    process.env.STOKER_TEST_ROOT_DIR = project.rootDir
    process.env.STOKER_TEST_BASE_URL = project.baseURL
    process.env.STOKER_TEST_USERS = JSON.stringify(project.users)
    process.env.STOKER_TEST_PORTS = JSON.stringify(project.ports)
}

export const authStatePath = (project: StokerProject, role: string): string =>
    join(project.rootDir, "playwright", ".auth", `${role.toLowerCase()}.json`)

export const getUser = (project: StokerProject, role: string): StokerTestUser => {
    // eslint-disable-next-line security/detect-object-injection
    const user = project.users[role]
    if (!user) {
        throw new Error(`No test user configured for role "${role}". Add it to stoker-test.json.`)
    }
    return user
}

export const resolveProject = (options: StokerProjectOptions = {}): StokerProject => {
    const rootDir = resolve(options.rootDir ?? process.env.STOKER_TEST_ROOT_DIR ?? process.cwd())
    loadEnvFiles(rootDir)

    return {
        rootDir,
        baseURL: options.baseURL ?? process.env.STOKER_TEST_BASE_URL ?? "http://localhost:5173",
        projectDataPath: join(rootDir, "functions", "project-data.json"),
        firebaseProjectId: resolveFirebaseProjectId(),
        functionsRegion: process.env.STOKER_FB_FUNCTIONS_REGION ?? "us-central1",
        ports: resolvePorts(rootDir, options.ports),
        users: resolveUsers(rootDir, options.users),
    }
}

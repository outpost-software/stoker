import { fileURLToPath } from "node:url"
import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test"
import { authStatePath, publishProject, resolveProject, type StokerProjectOptions } from "./project.js"
import { getRoles, loadSchema } from "./schema.js"
import { snapshotPreexistingPorts } from "./teardown.js"

export interface StokerWebTestOptions extends StokerProjectOptions {
    /** Where the project's own web tests live. Defaults to `test/e2e` */
    testDir?: string
    /**
     * Start the emulators and the web app dev server as part of the run. Defaults to `true`.
     * Set to `false` when you already have `npm start` running in another terminal.
     */
    manageServers?: boolean
    /** Playwright config overrides */
    overrides?: PlaywrightTestConfig
}

export const defineStokerWebTest = (options: StokerWebTestOptions = {}) => {
    const project = resolveProject(options)
    publishProject(project)
    const schema = loadSchema(project)
    const manageServers = options.manageServers ?? true
    if (manageServers) snapshotPreexistingPorts(project.rootDir)
    const schemaRoles = getRoles(schema)
    // eslint-disable-next-line security/detect-object-injection
    const roles = schemaRoles.filter((role) => project.users[role])
    if (roles.length === 0) {
        throw new Error("No test users match a role in the schema. Add them to stoker-test.json.")
    }

    return defineConfig({
        testDir: options.testDir ?? "test/e2e",
        fullyParallel: false,
        workers: 1,
        forbidOnly: !!process.env.CI,
        retries: process.env.CI ? 1 : 0,
        reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
        use: {
            baseURL: project.baseURL,
            trace: "retain-on-failure",
            screenshot: "only-on-failure",
        },
        projects: [
            {
                name: "setup",
                testDir: fileURLToPath(new URL("./setup/", import.meta.url)),
                testMatch: /.*\.setup\.js/,
                timeout: 300000,
            },
            ...roles.map((role) => ({
                name: role,
                dependencies: ["setup"],
                timeout: 120000,
                use: {
                    ...devices["Desktop Chrome"],
                    storageState: authStatePath(project, role),
                },
            })),
        ],
        globalTeardown: manageServers ? fileURLToPath(new URL("./teardown.js", import.meta.url)) : undefined,
        webServer: manageServers
            ? [
                  {
                      command: "npx stoker start",
                      url: `http://127.0.0.1:${project.ports.auth}`,
                      cwd: project.rootDir,
                      reuseExistingServer: !process.env.CI,
                      stdout: "pipe",
                      timeout: 180000,
                      gracefulShutdown: { signal: "SIGINT", timeout: 30000 },
                  },
                  {
                      command: "npm run web:dev",
                      url: project.baseURL,
                      cwd: project.rootDir,
                      reuseExistingServer: !process.env.CI,
                      stdout: "pipe",
                      timeout: 180000,
                      gracefulShutdown: { signal: "SIGINT", timeout: 10000 },
                  },
              ]
            : undefined,
        ...options.overrides,
    })
}

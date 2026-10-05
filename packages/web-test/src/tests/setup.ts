import { test as setup } from "@playwright/test"
import { clearTenantAlgolia, getCurrentUser, setUserPassword, start } from "../initializeStoker.js"
import { authStatePath, resolveProject } from "../config/project.js"
import { clearRecords } from "../config/records.js"
import { loadSchema } from "../config/schema.js"
import { saveAuthState, signIn } from "../config/session.js"

const project = resolveProject()
const schema = loadSchema(project)
// eslint-disable-next-line security/detect-object-injection
const roles = schema.config.roles.filter((role) => project.users[role])

setup("clear records from the previous run", async () => {
    clearRecords(project.rootDir)
    await start()
    await clearTenantAlgolia()
})

for (const role of roles) {
    setup(`authenticate as ${role}`, async ({ page }) => {
        await start()
        // eslint-disable-next-line security/detect-object-injection
        const fixtureUser = project.users[role]
        await setUserPassword(fixtureUser.email, fixtureUser.password)
        const user = await getCurrentUser(role)
        const actual = user?.customClaims?.role
        if (actual !== role) {
            throw new Error(
                `"${user.email}" is keyed as "${role}" but the Auth emulator gives it ${actual ? `"${actual}"` : "no role"}.`,
            )
        }

        await signIn(page, fixtureUser)
        await saveAuthState(page, authStatePath(project, role))
    })
}

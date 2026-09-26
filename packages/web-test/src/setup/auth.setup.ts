import { test as setup } from "@playwright/test"
import { ensureTestUser, getUserRole, waitForCallable } from "../emulator.js"
import { authStatePath, getUser, resolveProject } from "../project.js"
import { getRoles, loadSchema } from "../schema.js"
import { saveAuthState, signIn } from "./session.js"

const project = resolveProject()
const schema = loadSchema(project)
// eslint-disable-next-line security/detect-object-injection
const roles = getRoles(schema).filter((role) => project.users[role])

for (const role of roles) {
    setup(`authenticate as ${role}`, async ({ page }) => {
        const user = getUser(project, role)
        await waitForCallable(project, "stoker-customtoken")
        await ensureTestUser(project, user.email, user.password)

        const actual = await getUserRole(project, user.email)
        if (actual !== role) {
            throw new Error(
                `"${user.email}" is keyed as "${role}" but the Auth emulator gives it ${actual ? `"${actual}"` : "no role"}.`,
            )
        }

        await signIn(page, user)
        await saveAuthState(page, authStatePath(project, role))
    })
}

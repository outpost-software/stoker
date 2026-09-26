import type { Page } from "@playwright/test"
import { locators } from "../locators.js"
import type { StokerTestUser } from "../project.js"

export const signIn = async (page: Page, user: StokerTestUser): Promise<void> => {
    const ui = locators(page)

    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text())
    })
    page.on("requestfailed", (request) => {
        errors.push(`${request.method()} ${request.url()} failed: ${request.failure()?.errorText}`)
    })
    const detail = () => (errors.length ? `\n\nBrowser errors:\n  ${errors.join("\n  ")}` : "")

    await page.goto("/")
    try {
        await ui.login.email.waitFor({ state: "visible" })
    } catch (error) {
        throw new Error(`The login form did not render at ${page.url()}.${detail()}`, { cause: error })
    }

    await ui.login.email.fill(user.email)
    await ui.login.password.fill(user.password)
    await ui.login.submit.click()

    const outcome = await Promise.race([
        ui.login.heading.waitFor({ state: "detached" }).then(() => "signed-in" as const),
        ui.login.error.waitFor({ state: "visible" }).then(() => "rejected" as const),
    ])
    if (outcome === "rejected") {
        throw new Error(`Login was rejected for ${user.email}.${detail()}`)
    }
}

export const saveAuthState = async (page: Page, path: string): Promise<void> => {
    await page.context().storageState({ path, indexedDB: true })
}

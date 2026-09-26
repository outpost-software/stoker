import { test as base } from "@playwright/test"
import type { CollectionsSchema } from "@stoker-platform/types"
import { locators, type StokerLocators } from "./locators.js"
import { resolveProject, type StokerProject } from "./project.js"
import { loadSchema } from "./schema.js"

export interface StokerFixtures {
    /** The resolved project */
    project: StokerProject
    /** The published schema */
    schema: CollectionsSchema
    /** The role the current test runs as */
    role: string
    /** Selectors for the UI */
    ui: StokerLocators
}

export const test = base.extend<Pick<StokerFixtures, "role" | "ui">, Pick<StokerFixtures, "project" | "schema">>({
    // eslint-disable-next-line no-empty-pattern
    project: [async ({}, use) => use(resolveProject()), { scope: "worker" }],
    schema: [async ({ project }, use) => use(loadSchema(project)), { scope: "worker" }],
    // eslint-disable-next-line no-empty-pattern
    role: async ({}, use, testInfo) => use(testInfo.project.name),
    ui: async ({ page }, use) => use(locators(page)),
})

export { expect } from "@playwright/test"

import { test as base } from "@playwright/test"
import type { CollectionField, CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import { locators, type StokerLocators } from "./locators.js"
import { resolveProject, StokerTestRecords, type StokerProject } from "./project.js"
import { isRelationField, roleHasOperationAccess } from "@stoker-platform/utils"
import { distinctValue, isUnique } from "./schema.js"
import { fetchCurrentSchema } from "@stoker-platform/node-client"
import { start } from "../initializeStoker.js"

export interface StokerFixtures {
    /** The resolved project, with test records scoped to the current role */
    project: StokerProject
    /** The published schema */
    schema: CollectionsSchema
    /** The role the current test runs as */
    role: string
    /** Selectors for the UI */
    ui: StokerLocators
}

export const scopeRecords = (schema: CollectionsSchema, project: StokerProject, role: string): StokerTestRecords => {
    // eslint-disable-next-line security/detect-object-injection
    const roles = schema.config.roles.filter((candidate) => !!project.users[candidate])

    const writer = (collection: CollectionSchema) =>
        roleHasOperationAccess(collection, role, "create")
            ? role
            : roles.find((candidate) => roleHasOperationAccess(collection, candidate, "create"))

    const byWriter = (collection: CollectionSchema, field: CollectionField, value: string) => {
        const owner = writer(collection)
        return owner ? distinctValue(field, value, owner, roles.indexOf(owner) * 100) : value
    }

    const scoped = (collection: CollectionSchema, name: string, value: string): string => {
        const field = collection.fields.find((item) => item.name === name)
        if (!field) return value
        if (isUnique(field)) return byWriter(collection, field, value)
        if (!isRelationField(field)) return value
        // eslint-disable-next-line security/detect-object-injection
        const target = schema.collections[field.collection]
        const titleField = target?.fields.find((item) => item.name === (field.titleField || target.recordTitleField))
        if (!target || !titleField || !isUnique(titleField)) return value
        return byWriter(target, titleField, value)
    }

    return Object.fromEntries(
        Object.entries(project.records).map(([collectionName, fixture]) => {
            // eslint-disable-next-line security/detect-object-injection
            const collection = schema.collections[collectionName]
            if (!collection) return [collectionName, fixture]
            const fields = Object.entries(fixture).map(([name, values]) => [
                name,
                {
                    ...(values.create === undefined ? {} : { create: scoped(collection, name, values.create) }),
                    ...(values.update === undefined ? {} : { update: scoped(collection, name, values.update) }),
                },
            ])
            return [collectionName, Object.fromEntries(fields)]
        }),
    )
}

export const test = base.extend<Pick<StokerFixtures, "role" | "ui">, Pick<StokerFixtures, "project" | "schema">>({
    schema: [
        // eslint-disable-next-line no-empty-pattern
        async ({}, use) => {
            await start()
            await use(await fetchCurrentSchema(true))
        },
        { scope: "worker" },
    ],
    project: [
        async ({ schema }, use, workerInfo) => {
            const project = resolveProject()
            await use({ ...project, records: scopeRecords(schema, project, workerInfo.project.name) })
        },
        { scope: "worker" },
    ],
    // eslint-disable-next-line no-empty-pattern
    role: async ({}, use, testInfo) => use(testInfo.project.name),
    ui: async ({ page }, use) => use(locators(page)),
})

export { expect } from "@playwright/test"

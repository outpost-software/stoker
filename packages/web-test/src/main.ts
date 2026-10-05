export { test, expect, scopeRecords, type StokerFixtures } from "./config/fixtures.js"
export { runWebConformance, type ConformanceOptions } from "./tests/index.js"
export { locators, type StokerLocators } from "./config/locators.js"
export { saveAuthState, signIn } from "./config/session.js"
export { fieldValues } from "./tests/utils/form.js"
export {
    start,
    waitForSchemaIndex,
    setUserPassword,
    clearTenantAlgolia,
    getTenant,
    getCurrentUser,
    getCurrentUserPermissions,
} from "./initializeStoker.js"
export { clearRecords, documentIds, rememberRecord, fixtureRecordId, fixtureRecord } from "./config/records.js"
export {
    authStatePath,
    resolveProject,
    publishProject,
    type StokerProject,
    type StokerProjectOptions,
    type StokerTestUser,
    type StokerTestField,
    type StokerTestRecords,
    type StokerEmulatorPorts,
} from "./config/project.js"
export {
    loadSchema,
    getRootCollections,
    listableCollections,
    readableCollections,
    isUnique,
    distinctValue,
    relationListTitle,
    assignsFilePermissions,
    collectionPath,
    recordPath,
    type StokerOperation,
} from "./config/schema.js"

export { test, expect, type StokerFixtures } from "./fixtures.js"
export { runWebConformance, type ConformanceOptions } from "./conformance/index.js"
export { locators, type StokerLocators } from "./locators.js"
export { saveAuthState, signIn } from "./setup/session.js"
export { ensureTestUser, getUserRole, waitForCallable } from "./emulator.js"
export {
    authStatePath,
    getUser,
    resolveProject,
    publishProject,
    type StokerProject,
    type StokerProjectOptions,
    type StokerTestUser,
    type StokerEmulatorPorts,
} from "./project.js"
export {
    loadSchema,
    getRoles,
    getRootCollections,
    listableCollections,
    readableCollections,
    roleCanAccess,
    collectionPath,
    recordPath,
    type StokerOperation,
} from "./schema.js"

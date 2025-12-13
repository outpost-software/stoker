module.exports = {
    root: true,
    env: {
        es6: true,
        node: true,
    },
    extends: ["custom/base"],
    ignorePatterns: [
        "/lib/**/*",
        "/dist/**/*",
        "bin/**/*",
        "/functions",
        "test/**/*",
        "test-init",
        "vitest.config.ts",
        "/web-app",
        "ops.js",
    ],
}

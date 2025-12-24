module.exports = {
    env: {
        es6: true,
        node: true,
    },
    extends: [
        "eslint:recommended",
        "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:import/typescript",
        "plugin:@typescript-eslint/recommended",
        "plugin:security/recommended-legacy",
        "prettier",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: ["tsconfig.json"],
        sourceType: "module",
    },
    ignorePatterns: [
        "/lib/**/*",
        "/dist/**/*",
        "bin/**/*",
        "test/**/*",
        "vitest.config.ts",
        "/functions",
        "/web-app",
        "ops.js",
    ],
    plugins: ["@typescript-eslint", "import"],
    rules: {
        "import/no-unresolved": 0,
        "prefer-rest-params": 0,
    },
}

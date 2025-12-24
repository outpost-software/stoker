const { resolve } = require("node:path")

const project = resolve(process.cwd(), "tsconfig.json")

module.exports = {
    env: {
        es6: true,
    },
    extends: [
        "eslint:recommended",
        "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:import/typescript",
        "plugin:@typescript-eslint/recommended",
        "plugin:security/recommended-legacy",
        "prettier",
        "turbo",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: [project],
        sourceType: "module",
    },
    ignorePatterns: ["/lib/**/*", "/dist/**/*", "/functions"],
    plugins: ["@typescript-eslint", "import"],
    rules: {
        "import/no-unresolved": 0,
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/no-unused-expressions": "off",
    },
}

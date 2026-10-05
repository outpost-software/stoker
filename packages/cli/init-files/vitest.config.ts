import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"

const webAppSource = fileURLToPath(new URL("./node_modules/@stoker-platform/web-app/src", import.meta.url))

const require = createRequire(import.meta.url)
const webAppPackage: { dependencies: Record<string, string> } = require("@stoker-platform/web-app/package.json")
const radixPackages = Object.keys(webAppPackage.dependencies).filter((name) => name.startsWith("@radix-ui/"))

export default defineConfig({
    test: {
        globals: true,
        passWithNoTests: true,
        projects: [
            {
                test: {
                    name: "unit",
                    globals: true,
                    environment: "node",
                    include: ["test/**/*"],
                    exclude: ["test/e2e/**", "test/component/**"],
                },
            },
            {
                resolve: {
                    alias: { "@": webAppSource },
                },
                optimizeDeps: {
                    entries: ["test/component/**/*.test.{ts,tsx}"],
                    include: [
                        "react",
                        "react/jsx-runtime",
                        "react/jsx-dev-runtime",
                        "react-dom",
                        "react-dom/client",
                        "react-router",
                        "react-hook-form",
                        "react-day-picker",
                        "recharts",
                        "lucide-react",
                        "luxon",
                        "date-fns",
                        "cmdk",
                        "class-variance-authority",
                        "clsx",
                        "tailwind-merge",
                        "@stoker-platform/utils",
                        ...radixPackages,
                    ],
                },
                test: {
                    name: "component",
                    globals: true,
                    include: ["test/component/**/*.test.{ts,tsx}"],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [{ browser: "chromium" }],
                    },
                },
            },
        ],
    },
})

import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"

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
                    // test/e2e is owned by Playwright, not Vitest
                    include: ["test/**/*"],
                    exclude: ["test/e2e/**", "test/component/**"],
                },
            },
            {
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

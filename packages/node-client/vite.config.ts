/// <reference types="vitest" />

import { resolve } from "path"
import { defineConfig } from "vite"
import eslint from "vite-plugin-eslint"
import typescript from "@rollup/plugin-typescript"

export default defineConfig({
    plugins: [
        eslint(),
        typescript({
            declarationDir: resolve(import.meta.dirname, "dist/types"),
            declaration: true,
        }),
    ],
    build: {
        target: "esnext",
        lib: {
            entry: resolve(import.meta.dirname, "src/main.ts"),
            formats: ["es", "cjs"],
            fileName: "bundle",
        },
        rolldownOptions: {
            external: [/^node:.*/, /lodash\/.*/, /firebase-admin\/.*/, "@google-cloud/storage", "cross-spawn"],
            devtools: {},
        },
    },
    devtools: {
        enabled: false,
    },
})

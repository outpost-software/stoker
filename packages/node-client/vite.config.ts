/// <reference types="vitest" />

import { resolve } from "path"
import { defineConfig } from "vite"
import eslint from "vite-plugin-eslint"
import typescript from "@rollup/plugin-typescript"

export default defineConfig({
    plugins: [
        eslint(),
        typescript({
            declarationDir: resolve(__dirname, "dist/types"),
            declaration: true,
        }),
    ],
    build: {
        target: "esnext",
        lib: {
            entry: resolve(__dirname, "src/main.ts"),
            formats: ["es", "cjs"],
            fileName: "bundle",
        },
        rollupOptions: {
            external: [/lodash\/.*/, /firebase-admin\/.*/, "@google-cloud/storage", /^node:.*/],
        },
    },
})

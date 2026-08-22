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
            formats: ["es"],
            fileName: "bundle",
        },
        rollupOptions: {
            external: [/firebase\/.*/],
        },
    },
})

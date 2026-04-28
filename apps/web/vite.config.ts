import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import eslint from "vite-plugin-eslint"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { VitePWA } from "vite-plugin-pwa"
import { tryPromise } from "@stoker-platform/node-client"
import { watch } from "fs"

export default defineConfig(async ({ mode }) => {
    const env = loadEnv(mode, __dirname, "")
    const skipEslintDisable = (env.SKIP_ESLINT_DISABLE || process.env.SKIP_ESLINT_DISABLE) === "true"
    const path = join(process.cwd(), "src", "assets", "system-custom", "main.js")
    const url = pathToFileURL(path).href
    const globalConfigModule = await import(url)
    const globalConfig = globalConfigModule.default({ sdk: "web" })
    const appName = await tryPromise(globalConfig.appName)
    const description = await tryPromise(globalConfig.admin?.meta?.description)

    return {
        plugins: [
            eslint(),
            react(),
            VitePWA({
                registerType: "autoUpdate",
                workbox: {
                    globPatterns: ["**/*.{js,css,ico,png,svg,txt}"],
                    maximumFileSizeToCacheInBytes: 1024 * 1024 * 5,
                    navigateFallback: null,
                },
                manifest: {
                    name: appName,
                    description: description,
                    short_name: appName,
                    theme_color: "#000000",
                    display: "standalone",
                    icons: [
                        {
                            src: "pwa-192x192.png",
                            sizes: "192x192",
                            type: "image/png",
                        },
                        {
                            src: "pwa-512x512.png",
                            sizes: "512x512",
                            type: "image/png",
                        },
                        {
                            src: "pwa-512x512.png",
                            sizes: "512x512",
                            type: "image/png",
                            purpose: "any",
                        },
                        {
                            src: "pwa-512x512.png",
                            sizes: "512x512",
                            type: "image/png",
                            purpose: "maskable",
                        },
                    ],
                },
            }),
            {
                name: "watch-config",
                configureServer(server) {
                    const targetPath = join(__dirname, "src", "assets", "system-custom")
                    watch(targetPath, { recursive: true }, (eventType, filename) => {
                        if (filename && (filename.endsWith(".ts") || filename.endsWith(".js"))) {
                            server.moduleGraph.invalidateAll()
                        }
                    })
                },
            },
        ],
        build: {
            target: "esnext",
        },
        envPrefix: "STOKER_",
        resolve: {
            alias: {
                "@": resolve(__dirname, "./src"),
                react: skipEslintDisable ? resolve(__dirname, "./node_modules/react") : "react",
                "react-dom": skipEslintDisable ? resolve(__dirname, "./node_modules/react-dom") : "react-dom",
            },
        },
        optimizeDeps: {
            include: ["style-to-js", "debug", "extend", "classnames"],
        },
    }
})

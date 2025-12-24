#!/usr/bin/env -S node --no-warnings

import { dirname, join, resolve } from "path"
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from "fs"

// AI-generated code to shim custom admin app modules

try {
    const systemCustomRoot = resolve(process.cwd(), "functions", "src", "system-custom")

    if (!existsSync(systemCustomRoot)) {
        process.exit(0)
    }

    const importMap = new Map()

    const addImportSpec = (specPath, specifiers) => {
        if (!importMap.has(specPath)) {
            importMap.set(specPath, { hasDefault: false, named: new Set() })
        }
        const record = importMap.get(specPath)
        if (specifiers.default) record.hasDefault = true
        for (const name of specifiers.named || []) record.named.add(name)
    }

    const walkFiles = (dir) => {
        const entries = readdirSync(dir)
        for (const entry of entries) {
            const full = join(dir, entry)
            const stats = statSync(full)
            if (stats.isDirectory()) {
                walkFiles(full)
            } else if (stats.isFile()) {
                if (/(\.ts|\.tsx|\.js|\.mjs)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
                    const code = readFileSync(full, "utf8")
                    const lines = code.split(/\r?\n/)
                    for (const line of lines) {
                        // ESM imports on a single line
                        const importMatch = line.match(/^\s*import\s+(.*?)\s+from\s+["']\.\.\/web\/([^"']+)["']/)
                        if (importMatch) {
                            let bindings = importMatch[1].trim()
                            const rel = importMatch[2].trim()
                            const spec = { default: false, named: [] }
                            if (bindings.startsWith("type ")) {
                                bindings = bindings.slice(5).trim()
                            }
                            if (bindings.startsWith("* as ")) {
                                // namespace import; no specific exports required
                            } else if (bindings.startsWith("{")) {
                                const names = bindings
                                    .replace(/[\{\}]/g, "")
                                    .split(",")
                                    .map((s) =>
                                        s
                                            .trim()
                                            .split(/\s+as\s+/)[0]
                                            .trim(),
                                    )
                                    .filter(Boolean)
                                spec.named = names
                            } else if (bindings.includes(",")) {
                                const [def, rest] = bindings.split(",")
                                spec.default = def.trim().length > 0
                                const names = rest
                                    .replace(/[\{\}]/g, "")
                                    .split(",")
                                    .map((s) =>
                                        s
                                            .trim()
                                            .split(/\s+as\s+/)[0]
                                            .trim(),
                                    )
                                    .filter(Boolean)
                                spec.named = names
                            } else {
                                spec.default = true
                            }
                            addImportSpec(rel, spec)
                        }
                    }
                }
            }
        }
    }

    walkFiles(systemCustomRoot)

    if (importMap.size === 0) {
        process.exit(0)
    }

    const customDir = join(systemCustomRoot, "web")
    if (!existsSync(customDir)) mkdirSync(customDir, { recursive: true })

    for (const [relPath, spec] of importMap.entries()) {
        const outPathJs = join(customDir, relPath)
        const outDir = dirname(outPathJs)
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

        // Determine base without extension
        const baseRel = relPath.replace(/\.(js|mjs|cjs|ts|tsx)$/, "")

        // Remove any colliding TypeScript sources in src/system-custom/web
        const tsCandidates = [`${baseRel}.ts`, `${baseRel}.tsx`]
        for (const candidate of tsCandidates) {
            const tsPath = join(customDir, candidate)
            if (existsSync(tsPath)) {
                try {
                    unlinkSync(tsPath)
                } catch {}
            }
        }

        // Remove any stale compiled JS outputs in lib/system-custom/web
        const libCustomDir = resolve(process.cwd(), "functions", "lib", "system-custom", "web")
        if (existsSync(libCustomDir)) {
            const jsCandidates = [
                `${baseRel}.js`,
                `${baseRel}.mjs`,
                `${baseRel}.cjs`,
                `${baseRel}.js.map`,
                `${baseRel}.d.ts`,
                `${baseRel}.d.ts.map`,
            ]
            for (const candidate of jsCandidates) {
                const jsPath = join(libCustomDir, candidate)
                if (existsSync(jsPath)) {
                    try {
                        unlinkSync(jsPath)
                    } catch {}
                }
            }
        }

        // Remove any previously generated JS shim in src (we'll emit TS stubs instead)
        if (existsSync(outPathJs)) {
            try {
                unlinkSync(outPathJs)
            } catch {}
        }

        // Emit a TypeScript stub to ensure TSC outputs to lib
        const tsOutPath = join(customDir, `${baseRel}.ts`)
        let tsContent = ""
        if (spec.hasDefault) {
            tsContent += "const _default: any = undefined\nexport default _default\n"
        }
        for (const name of spec.named) {
            tsContent += `export const ${name}: any = undefined\n`
        }
        if (tsContent === "") {
            tsContent = "export {}\n"
        }
        writeFileSync(tsOutPath, tsContent, "utf8")
    }
} catch (error) {
    console.error(error)
    process.exit(1)
}

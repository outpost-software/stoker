#!/usr/bin/env -S node --no-warnings

import { runChildProcess, tryPromise } from "@stoker-platform/node-client"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { cpSync, existsSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from "fs"
import { readFile, writeFile } from "fs/promises"
import dotenv from "dotenv"

try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    if (existsSync(join(__dirname, "..", "src", "assets", "system-custom"))) {
        rmSync(join(__dirname, "..", "src", "assets", "system-custom"), { recursive: true })
    }

    if (!process.env.ADMIN_CSP) {
        dotenv.config({ path: join(process.cwd(), ".env", ".env"), quiet: true })
    }

    if (existsSync(join(__dirname, "..", "firebase.json"))) {
        rmSync(join(__dirname, "..", "firebase.json"))
    }
    cpSync(join(process.cwd(), "firebase.hosting.json"), join(__dirname, "..", "firebase.json"))

    cpSync(join(process.cwd(), "src"), join(__dirname, "..", "src", "assets", "system-custom"), { recursive: true })
    cpSync(join(process.cwd(), "lib", "main.js"), join(__dirname, "..", "src", "assets", "system-custom", "main.js"))

    // AI-generated code to shim node modules

    const nodeDir = join(__dirname, "..", "src", "assets", "system-custom", "node")

    const stripStringsAndComments = (code) => {
        let out = ""
        let inSingle = false
        let inDouble = false
        let inTemplate = false
        let inLineComment = false
        let inBlockComment = false
        let prev = ""
        for (let i = 0; i < code.length; i++) {
            const ch = code[i]
            const nextCh = i + 1 < code.length ? code[i + 1] : ""
            if (inLineComment) {
                if (ch === "\n") {
                    inLineComment = false
                    out += "\n"
                } else {
                    out += " "
                }
                continue
            }
            if (inBlockComment) {
                if (ch === "*" && nextCh === "/") {
                    inBlockComment = false
                    i++
                    out += "  "
                } else {
                    out += ch === "\n" ? "\n" : " "
                }
                continue
            }
            if (!inSingle && !inDouble && !inTemplate) {
                if (ch === "/" && nextCh === "/") {
                    inLineComment = true
                    i++
                    out += "  "
                    continue
                }
                if (ch === "/" && nextCh === "*") {
                    inBlockComment = true
                    i++
                    out += "  "
                    continue
                }
            }
            if (!inDouble && !inTemplate && ch === "'" && prev !== "\\") {
                inSingle = !inSingle
                out += " "
            } else if (!inSingle && !inTemplate && ch === '"' && prev !== "\\") {
                inDouble = !inDouble
                out += " "
            } else if (!inSingle && !inDouble && ch === "`" && prev !== "\\") {
                inTemplate = !inTemplate
                out += " "
            } else {
                out += inSingle || inDouble || inTemplate ? " " : ch
            }
            prev = ch
        }
        return out
    }
    const getExportSpec = (code) => {
        const cleaned = stripStringsAndComments(code)
        const named = new Set()
        let hasDefault = false
        if (/\bexport\s+default\b/.test(cleaned)) {
            hasDefault = true
        }
        const fnRegex = /\bexport\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g
        const varRegex = /\bexport\s+(?:const|let|var)\s+([A-Za-z0-9_]+)/g
        const classRegex = /\bexport\s+class\s+([A-Za-z0-9_]+)/g
        const enumRegex = /\bexport\s+enum\s+([A-Za-z0-9_]+)/g
        const namedRegex = /\bexport\s*\{\s*([^}]+)\s*\}(?:\s*from\s*["'][^"']+["'])?/g
        const starAsRegex = /\bexport\s*\*\s+as\s+([A-Za-z0-9_]+)\s+from\s*["'][^"']+["']/g
        let m
        while ((m = fnRegex.exec(cleaned)) !== null) named.add(m[1])
        while ((m = varRegex.exec(cleaned)) !== null) named.add(m[1])
        while ((m = classRegex.exec(cleaned)) !== null) named.add(m[1])
        while ((m = enumRegex.exec(cleaned)) !== null) named.add(m[1])
        while ((m = starAsRegex.exec(cleaned)) !== null) named.add(m[1])
        while ((m = namedRegex.exec(cleaned)) !== null) {
            const parts = m[1]
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            for (const part of parts) {
                const asMatch = part.match(/^([A-Za-z0-9_]+)\s+as\s+([A-Za-z0-9_]+)$/)
                if (asMatch) {
                    named.add(asMatch[2])
                } else if (part !== "default") {
                    named.add(part)
                } else {
                    hasDefault = true
                }
            }
        }
        return { hasDefault, named: Array.from(named) }
    }
    if (existsSync(nodeDir)) {
        const files = readdirSync(nodeDir, { recursive: true })
        for (const file of files) {
            const filePath = join(nodeDir, file)
            if (statSync(filePath).isFile() && file.endsWith(".ts")) {
                const original = readFileSync(filePath, "utf8")
                const spec = getExportSpec(original)
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
                writeFileSync(filePath, tsContent, "utf8")
            }
        }
    }

    // AI-generated code to strip serverAccess functions from client config files

    const systemCustomDir = join(__dirname, "..", "src", "assets", "system-custom")

    const removePropertyBlock = (code, propertyName) => {
        let output = code
        const propRegex = new RegExp(`\\b${propertyName}\\s*:`, "g")
        let match
        while ((match = propRegex.exec(output)) !== null) {
            let start = match.index
            let i = match.index + match[0].length
            // Skip whitespace
            while (i < output.length && /\s/.test(output[i])) i++
            if (output[i] !== "{") continue
            const blockStart = i
            // Find matching closing brace, accounting for strings and comments
            let depth = 0
            let inSingle = false
            let inDouble = false
            let inTemplate = false
            let inLineComment = false
            let inBlockComment = false
            let prevChar = ""
            let j = blockStart
            for (; j < output.length; j++) {
                const ch = output[j]
                const nextCh = j + 1 < output.length ? output[j + 1] : ""
                if (inLineComment) {
                    if (ch === "\n") inLineComment = false
                    continue
                }
                if (inBlockComment) {
                    if (ch === "*" && nextCh === "/") {
                        inBlockComment = false
                        j++
                    }
                    continue
                }
                if (!inSingle && !inDouble && !inTemplate) {
                    if (ch === "/" && nextCh === "/") {
                        inLineComment = true
                        j++
                        continue
                    }
                    if (ch === "/" && nextCh === "*") {
                        inBlockComment = true
                        j++
                        continue
                    }
                }
                if (!inDouble && !inTemplate && ch === "'" && prevChar !== "\\") {
                    inSingle = !inSingle
                } else if (!inSingle && !inTemplate && ch === '"' && prevChar !== "\\") {
                    inDouble = !inDouble
                } else if (!inSingle && !inDouble && ch === "`" && prevChar !== "\\") {
                    inTemplate = !inTemplate
                } else if (!inSingle && !inDouble && !inTemplate) {
                    if (ch === "{") depth++
                    if (ch === "}") {
                        depth--
                        if (depth === 0) {
                            break
                        }
                    }
                }
                prevChar = ch
            }
            if (j >= output.length) break
            const blockEnd = j // position of closing '}'
            // Remove trailing comma after the block, if present (preserve newlines)
            let k = blockEnd + 1
            while (k < output.length && (output[k] === " " || output[k] === "\t")) k++
            let end = k
            if (output[k] === ",") {
                end = k + 1
            } else {
                // Or remove a comma before the property if it exists
                let p = start - 1
                while (p >= 0 && (output[p] === " " || output[p] === "\t")) p--
                if (output[p] === ",") {
                    start = p
                }
            }
            output = output.slice(0, start) + output.slice(end)
            // Reset regex lastIndex since we changed the string
            propRegex.lastIndex = 0
        }
        return output
    }

    const stripServerAccess = (code) => removePropertyBlock(code, "serverAccess")

    // AI-generated code to strip server code from config files

    const findMatchingBrace = (code, startPos) => {
        let depth = 1
        let inSingle = false
        let inDouble = false
        let inTemplate = false
        let inLineComment = false
        let inBlockComment = false
        let prevChar = ""
        let i = startPos

        for (; i < code.length && depth > 0; i++) {
            const ch = code[i]
            const nextCh = i + 1 < code.length ? code[i + 1] : ""

            if (inLineComment) {
                if (ch === "\n") inLineComment = false
                continue
            }
            if (inBlockComment) {
                if (ch === "*" && nextCh === "/") {
                    inBlockComment = false
                    i++
                }
                continue
            }
            if (!inSingle && !inDouble && !inTemplate) {
                if (ch === "/" && nextCh === "/") {
                    inLineComment = true
                    i++
                    continue
                }
                if (ch === "/" && nextCh === "*") {
                    inBlockComment = true
                    i++
                    continue
                }
            }
            if (!inDouble && !inTemplate && ch === "'" && prevChar !== "\\") {
                inSingle = !inSingle
            } else if (!inSingle && !inTemplate && ch === '"' && prevChar !== "\\") {
                inDouble = !inDouble
            } else if (!inSingle && !inDouble && ch === "`" && prevChar !== "\\") {
                inTemplate = !inTemplate
            } else if (!inSingle && !inDouble && !inTemplate) {
                if (ch === "{") depth++
                if (ch === "}") depth--
            }
            prevChar = ch
        }

        return depth === 0 ? i - 1 : -1
    }

    const stripServerGuards = (code) => {
        let output = code
        let changed = true

        // Keep processing until no more changes (handles nested cases)
        while (changed) {
            changed = false

            // Pattern 1: Remove entire if (sdk === "node") blocks
            const nodeGuardPattern = /if\s*\(\s*sdk\s*===\s*["']node["']\s*\)\s*\{/g

            let match
            while ((match = nodeGuardPattern.exec(output)) !== null) {
                const ifStart = match.index
                const braceStart = match.index + match[0].length

                const braceEnd = findMatchingBrace(output, braceStart)
                if (braceEnd === -1) continue // Malformed, skip

                // Find the start of the if statement (may include whitespace before)
                let ifStatementStart = ifStart
                while (ifStatementStart > 0 && /\s/.test(output[ifStatementStart - 1])) {
                    ifStatementStart--
                }

                // Remove the entire if block
                output = output.slice(0, ifStatementStart) + output.slice(braceEnd + 1)
                changed = true

                // Break and restart from beginning since we modified the string
                break
            }

            if (changed) continue // Restart to handle nested cases

            // Pattern 2: Remove else blocks following if (sdk === "web")
            const webGuardPattern = /if\s*\(\s*sdk\s*===\s*["']web["']\s*\)\s*\{/g

            while ((match = webGuardPattern.exec(output)) !== null) {
                const braceStart = match.index + match[0].length

                const ifBlockEnd = findMatchingBrace(output, braceStart)
                if (ifBlockEnd === -1) continue // Malformed, skip

                // Check if there's an else/else if after this
                let j = ifBlockEnd + 1
                while (j < output.length && /\s/.test(output[j])) j++

                if (j >= output.length) continue

                // Check for "else" or "else if"
                const elseMatch = output.slice(j).match(/^\s*else\s*(if\s*\([^)]+\)\s*\{|\{)/)
                if (!elseMatch) continue

                const elseStart = j
                const elseBlockStart = j + elseMatch[0].indexOf("{")

                const elseBlockEnd = findMatchingBrace(output, elseBlockStart + 1)
                if (elseBlockEnd === -1) continue // Malformed, skip

                // Remove the else block (including "else" keyword and braces)
                output = output.slice(0, elseStart) + output.slice(elseBlockEnd + 1)
                changed = true

                // Break and restart from beginning since we modified the string
                break
            }
        }

        return output
    }

    const targetFiles = []
    const collectionsDir = join(systemCustomDir, "collections")
    if (existsSync(collectionsDir)) {
        const entries = readdirSync(collectionsDir)
        for (const entry of entries) {
            const fullPath = join(collectionsDir, entry)
            const stats = statSync(fullPath)
            if (stats.isFile()) {
                targetFiles.push(fullPath)
            }
        }
    }
    const mainFile = join(systemCustomDir, "main.ts")
    if (existsSync(mainFile)) {
        targetFiles.push(mainFile)
    }
    const mainFileJS = join(systemCustomDir, "main.js")
    if (existsSync(mainFileJS)) {
        targetFiles.push(mainFileJS)
    }

    for (const file of targetFiles) {
        if (file.endsWith(".d.ts")) continue
        const original = readFileSync(file, "utf8")
        let transformed = stripServerAccess(original)
        transformed = stripServerGuards(transformed)
        if (transformed !== original) {
            writeFileSync(file, transformed)
        }
    }
    cpSync(join(process.cwd(), ".env", `.env.${process.env.GCP_PROJECT}`), join(__dirname, "..", ".env"))

    cpSync(join(process.cwd(), "icons", "logo-small.png"), join(__dirname, "..", "public", "logo-small.png"))
    cpSync(join(process.cwd(), "icons", "logo-large.png"), join(__dirname, "..", "public", "logo-large.png"))
    cpSync(join(process.cwd(), "icons", "logo-small.png"), join(__dirname, "..", "src", "assets", "logo-small.png"))
    cpSync(join(process.cwd(), "icons", "logo-large.png"), join(__dirname, "..", "src", "assets", "logo-large.png"))
    await runChildProcess("npm", ["run", "generate-pwa-assets"], join(__dirname, ".."))

    const globalConfigModule = await import(join(process.cwd(), "lib", "main.js"))
    const globalConfig = globalConfigModule.default("node")
    const appName = await tryPromise(globalConfig.appName)
    const description = await tryPromise(globalConfig.admin?.meta?.description)

    let indexHtml = readFileSync(join(__dirname, "..", "index.html"), "utf8")
    indexHtml = indexHtml.replace(/<title>.*?<\/title>/, `<title>${appName}</title>`)
    indexHtml = indexHtml.replace(
        /<meta name="description" content=".*?" \/>/,
        `<meta name="description" content="${description || "A web app built using the Stoker platform."}" />`,
    )
    writeFileSync(join(__dirname, "..", "index.html"), indexHtml)

    let viteConfigPath = join(__dirname, "..", "vite.config.ts")
    let viteConfig = readFileSync(viteConfigPath, "utf8")
    viteConfig = viteConfig.replace(/eslint\(\),/, "// eslint(),")
    writeFileSync(viteConfigPath, viteConfig)

    const updateDependencies = async (packageJsonPath, externalDeps) => {
        const packageJsonRaw = await readFile(packageJsonPath, "utf8")
        const packageJson = JSON.parse(packageJsonRaw)

        const dependencies = packageJson.dependencies || {}
        const previouslyManaged = packageJson.stokerExternalPackages || {}

        let changed = false

        for (const managedName of Object.keys(previouslyManaged)) {
            if (!Object.prototype.hasOwnProperty.call(externalDeps, managedName)) {
                if (Object.prototype.hasOwnProperty.call(dependencies, managedName)) {
                    delete dependencies[managedName]
                    changed = true
                }
            }
        }

        for (const [depName, depVersion] of Object.entries(externalDeps)) {
            if (dependencies[depName] !== depVersion) {
                dependencies[depName] = depVersion
                changed = true
            }
        }

        packageJson.dependencies = dependencies
        packageJson.stokerExternalPackages = externalDeps

        if (changed || JSON.stringify(previouslyManaged) !== JSON.stringify(externalDeps)) {
            await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n")
        }

        return changed
    }

    const externalPackagesPath = join(process.cwd(), "external.package.json")
    if (existsSync(externalPackagesPath)) {
        const externalRaw = await readFile(externalPackagesPath, "utf8")
        const external = JSON.parse(externalRaw)
        const serverDeps = external.web || {}

        const appDir = join(__dirname, "..")
        const appPackageJson = join(appDir, "package.json")

        await updateDependencies(appPackageJson, serverDeps)
    }

    await runChildProcess("npm", ["run", "build"], join(__dirname, ".."))
    process.exit()
} catch (error) {
    throw new Error(error)
}

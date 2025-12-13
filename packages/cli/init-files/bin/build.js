#!/usr/bin/env -S node --no-warnings

import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { readFile, writeFile, readdir, mkdir, copyFile } from "fs/promises"
import { existsSync } from "fs"
import dotenv from "dotenv"
import { runChildProcess } from "@stoker-platform/node-client"

dotenv.config({ path: join(process.cwd(), ".env", ".env"), quiet: true })

try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)

    // Remove CSS imports from all JS files in lib directory

    async function processFile(filePath) {
        try {
            const content = await readFile(filePath, "utf8")
            const lines = content.split("\n")
            const filteredLines = lines.filter((line) => {
                const trimmed = line.trim()
                // Match: import "./something.css" or import './something.css'
                if (/^import\s+["']\.\/.*\.css["'];?\s*$/.test(trimmed)) {
                    return false
                }
                // Match: import "something.css" or import 'something.css' (absolute imports)
                if (/^import\s+["'].*\.css["'];?\s*$/.test(trimmed)) {
                    return false
                }
                return true
            })

            const newContent = filteredLines.join("\n")
            if (newContent !== content) {
                await writeFile(filePath, newContent, "utf8")
                console.log(`Removed CSS imports from: ${filePath}`)
            }
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message)
        }
    }

    async function walkDirectory(dir) {
        try {
            const entries = await readdir(dir, { withFileTypes: true })

            for (const entry of entries) {
                const fullPath = join(dir, entry.name)

                if (entry.isDirectory()) {
                    await walkDirectory(fullPath)
                } else if (entry.isFile() && entry.name.endsWith(".js")) {
                    await processFile(fullPath)
                }
            }
        } catch (error) {
            if (error.code !== "ENOENT") {
                console.error(`Error walking directory ${dir}:`, error.message)
            }
        }
    }

    async function removeCSSImports() {
        const libDir = join(__dirname, "..", "lib")
        await walkDirectory(libDir)
    }

    await removeCSSImports().catch((error) => {
        console.error("Error:", error)
        process.exit(1)
    })

    // Set up Firebase Extension files

    const envFile = await readFile(join(__dirname, "..", ".env", ".env"), "utf8")
    const envFileLines = envFile.split("\n")
    const databaseRegion = envFileLines.find((line) => line.startsWith("FB_FIRESTORE_REGION="))

    const mailRegion = envFileLines.find((line) => line.startsWith("MAIL_REGION="))
    const mailSender = envFileLines.find((line) => line.startsWith("MAIL_SENDER="))
    const mailSmtpConnectionUri = envFileLines.find((line) => line.startsWith("MAIL_SMTP_CONNECTION_URI="))

    const extensionEnvFile = await readFile(join(__dirname, "..", "extensions", "firestore-send-email.env"), "utf8")
    const extensionEnvFileLines = extensionEnvFile.split("\n")
    const linesToRemove = [
        "EVENTARC_CHANNEL=",
        "DEFAULT_FROM=",
        "DEFAULT_REPLY_TO=",
        "SMTP_CONNECTION_URI=",
        "firebaseextensions.v1beta.function/location=",
        "DATABASE_REGION=",
    ]
    const filteredLines = extensionEnvFileLines.filter(
        (line) => !linesToRemove.some((removeStr) => line.startsWith(removeStr)),
    )
    filteredLines.push(
        `EVENTARC_CHANNEL=projects/\${param:PROJECT_ID}/locations/${mailRegion.split("=")[1].replace(/^"|"$/g, "")}/channels/firebase`,
    )
    filteredLines.push(`firebaseextensions.v1beta.function/location=${process.env.FB_FUNCTIONS_REGION}`)
    filteredLines.push(`DEFAULT_FROM=${mailSender.split("=")[1].replace(/^"|"$/g, "")}`)
    filteredLines.push(`DEFAULT_REPLY_TO=${mailSender.split("=")[1].replace(/^"|"$/g, "")}`)
    filteredLines.push(`SMTP_CONNECTION_URI=${mailSmtpConnectionUri.split("=")[1].replace(/^"|"$/g, "")}`)
    filteredLines.push(`DATABASE_REGION=${databaseRegion.split("=")[1].replace(/^"|"$/g, "")}`)
    await writeFile(join(__dirname, "..", "extensions", "firestore-send-email.env"), filteredLines.join("\n"))

    // Update dependencies according to external.package.json

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
        const serverDeps = external.server || {}
        const webDeps = external.web || {}

        const appDir = join(process.cwd())
        const functionsDir = join(process.cwd(), "functions")

        const appPackageJson = join(appDir, "package.json")
        const functionsPackageJson = join(functionsDir, "package.json")

        const appChanged = await updateDependencies(appPackageJson, { ...serverDeps, ...webDeps })
        const functionsChanged = await updateDependencies(functionsPackageJson, serverDeps)

        if (appChanged) {
            await runChildProcess("npm", ["install", "--no-audit", "--no-fund"], appDir)
        }
        if (functionsChanged) {
            await runChildProcess("npm", ["install", "--no-audit", "--no-fund"], functionsDir)
        }
    }
} catch (error) {
    throw new Error(error)
}

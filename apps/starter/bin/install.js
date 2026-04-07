#!/usr/bin/env -S node --no-warnings

import { readFile, writeFile } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"
import { runChildProcess } from "@stoker-platform/node-client"

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

#!/usr/bin/env -S node --no-warnings

import { createRequire } from "module"
import { realpathSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath, pathToFileURL } from "url"

const resolveLocalCLI = () => {
    try {
        const require = createRequire(join(process.cwd(), "package.json"))
        const localPackageJson = require.resolve("@stoker-platform/cli/package.json")
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const localRoot = realpathSync(dirname(localPackageJson))
        const ownRoot = realpathSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".."))
        if (localRoot === ownRoot) return
        return join(localRoot, "lib", "src", "main.js")
    } catch {
        return
    }
}

const localCli = resolveLocalCLI()
await import(localCli ? pathToFileURL(localCli).href : "./main.js")

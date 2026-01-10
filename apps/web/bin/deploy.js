#!/usr/bin/env -S node --no-warnings

import { runChildProcess } from "@stoker-platform/node-client"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { cpSync } from "fs"

try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    cpSync(join(process.cwd(), ".firebaserc"), join(__dirname, "..", ".firebaserc"))
    await runChildProcess(
        "firebase",
        ["deploy", "--project", process.env.GCP_PROJECT, "--force"],
        join(__dirname, ".."),
    )
    process.exit()
} catch (error) {
    throw new Error(error)
}

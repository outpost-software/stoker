#!/usr/bin/env node
import { initializeStoker } from "@stoker-platform/node-client"
import { join } from "path"
import { existsSync } from "fs"

import dotenv from "dotenv"
const projectEnvFile = join(process.cwd(), ".env", `.env.project.${process.env.GCP_PROJECT}`)
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (existsSync(projectEnvFile)) {
    dotenv.config({ path: projectEnvFile, quiet: true })
} else {
    dotenv.config({ path: ".env/.env", quiet: true })
}
dotenv.config({ path: `.env/.env.${process.env.GCP_PROJECT}`, quiet: true })

const tenantId = ""

await initializeStoker(
    "production",
    tenantId,
    join(process.cwd(), "lib", "main.js"),
    join(process.cwd(), "lib", "collections"),
)

process.exit()

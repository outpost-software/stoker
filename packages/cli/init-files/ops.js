#!/usr/bin/env node
import { initializeStoker, getSome } from "@stoker-platform/node-client"
import { join } from "path"

import dotenv from "dotenv"
dotenv.config({ path: ".env/.env", quiet: true })
dotenv.config({ path: `.env/.env.${process.env.GCP_PROJECT}`, quiet: true })

const tenantId = ""

await initializeStoker(
    "production",
    tenantId,
    join(process.cwd(), "lib", "main.js"),
    join(process.cwd(), "lib", "collections"),
)

process.exit()

import type { CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import { runChildProcess, initializeFirebase } from "@stoker-platform/node-client"

import spawn from "cross-spawn"
import { generateSchema } from "../schema/generateSchema.js"
import { lintSchema } from "../../lint/lintSchema.js"

export const deployTTLs = async () => {
    const firebaseConfigString = process.env.STOKER_FB_WEB_APP_CONFIG
    if (!firebaseConfigString) throw new Error("Firebase web app config not found.")
    const firebaseConfig = JSON.parse(firebaseConfigString)
    const projectId = firebaseConfig.projectId

    await initializeFirebase()

    const currentSchema: CollectionsSchema = await generateSchema()

    await lintSchema(true)

    const ttlsToAdd: Promise<void>[] = []
    const ttlsToRemove: Promise<void>[] = []

    const deployTTL = (collectionName: string, ttl: string) => {
        return new Promise<void>((resolve, reject) => {
            return runChildProcess("gcloud", [
                "firestore",
                "fields",
                "ttls",
                "update",
                ttl,
                `--collection-group=${collectionName}`,
                "--enable-ttl",
                `--project=${projectId}`,
                "--quiet",
                "--async",
            ])
                .then(() => resolve())
                .catch((error: unknown) => reject(error))
        })
    }

    const removeTTL = (collectionName: string, ttl: string) => {
        return new Promise<void>((resolve, reject) => {
            return runChildProcess("gcloud", [
                "firestore",
                "fields",
                "ttls",
                "update",
                ttl,
                `--collection-group=${collectionName}`,
                "--disable-ttl",
                `--project=${projectId}`,
                "--quiet",
                "--async",
            ])
                .then(() => resolve())
                .catch((error: unknown) => reject(error))
        })
    }

    const existingTTL: { [key: string]: string } = {}

    const firestoreCollections = Object.values(currentSchema.collections)
        .map((collection) => collection.labels.collection)
        .concat("system_write_log")

    for (const collection of firestoreCollections) {
        const spawnPromise = new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            const childProcess = spawn("gcloud", [
                "firestore",
                "fields",
                "ttls",
                "list",
                `--collection-group=${collection}`,
                `--project=${projectId}`,
            ])
            let stdout = ""
            let stderr = ""
            childProcess.stdout?.on("data", (data) => {
                stdout += data.toString()
            })
            childProcess.stderr?.on("data", (data) => {
                stderr += data.toString()
            })
            childProcess.on("close", (code) => {
                if (code === 0) {
                    resolve({ stdout, stderr })
                } else {
                    reject(new Error(`Error retrieving ${collection} TTL`))
                }
            })
        })
        const { stdout, stderr } = await spawnPromise
        // eslint-disable-next-line security/detect-object-injection
        existingTTL[collection] = stdout
        if (stderr) {
            console.log(`Retrieve ${collection} TTL: ${stderr}`)
        }
    }

    if (currentSchema.config.writeLogTTL) {
        if (!existingTTL["system_write_log"].includes("system_write_log/fields/TTL")) {
            ttlsToAdd.push(deployTTL("system_write_log", "TTL"))
        } else {
            console.log(`TTL already exists for Write Log.\n`)
        }
    } else if (existingTTL["system_write_log"]) {
        ttlsToRemove.push(removeTTL("system_write_log", "TTL"))
    }

    Object.values(currentSchema.collections).forEach((collection: CollectionSchema) => {
        const { labels, ttl } = collection
        const path = `databases/(default)/collectionGroups/${labels.collection}/fields/`
        if (ttl) {
            if (!existingTTL[labels.collection].includes(`${path}${ttl}\n`)) {
                ttlsToAdd.push(deployTTL(labels.collection, ttl))
            } else {
                console.log(`TTL ${ttl} already exists for collection ${labels.collection}.\n`)
            }
            if (existingTTL[labels.collection].includes(path) && !existingTTL[labels.collection].includes(`${ttl}\n`)) {
                ttlsToRemove.push(
                    removeTTL(labels.collection, existingTTL[labels.collection].split(path)[1].split("\n")[0]),
                )
            }
        } else if (existingTTL[labels.collection]) {
            ttlsToRemove.push(
                removeTTL(labels.collection, existingTTL[labels.collection].split(path)[1].split("\n")[0]),
            )
        }
    })

    try {
        await Promise.all(ttlsToRemove)
        await Promise.all(ttlsToAdd)
        process.exit()
    } catch (error) {
        throw new Error("Error deploying TTLs", { cause: error })
    }
}

import { initializeFirebase, runChildProcess } from "@stoker-platform/node-client"
import { getDatabase } from "firebase-admin/database"
import { mkdir, rm, writeFile } from "fs/promises"
import { join } from "path"
import { CollectionsSchema } from "@stoker-platform/types"

export const prepareEmulatorData = async () => {
    if (!process.env.GCP_PROJECT) {
        throw new Error("GCP_PROJECT not set.")
    }
    if (!process.env.FB_DATABASE) {
        throw new Error("FB_DATABASE not set.")
    }
    if (!process.env.FB_AUTH_PASSWORD_POLICY) {
        throw new Error("FB_AUTH_PASSWORD_POLICY not set.")
    }
    if (!process.env.FB_AUTH_PASSWORD_POLICY_UPGRADE) {
        throw new Error("FB_AUTH_PASSWORD_POLICY_UPGRADE not set.")
    }

    const authConfig = {
        signIn: {
            email: {
                enabled: true,
                passwordRequired: true,
            },
            allowDuplicateEmails: false,
        },
        client: {
            permissions: {
                disabledUserSignup: true,
                disabledUserDeletion: true,
            },
        },
        mfa: {
            state: "ENABLED",
            providerConfigs: [
                {
                    state: "ENABLED",
                    totpProviderConfig: {
                        adjacentIntervals: 5,
                    },
                },
            ],
        },
        emailPrivacyConfig: {
            enableImprovedEmailPrivacy: true,
        },
        passwordPolicyConfig: {
            passwordPolicyEnforcementState: "ENFORCE",
            forceUpgradeOnSignin: JSON.parse(process.env.FB_AUTH_PASSWORD_POLICY_UPGRADE),
            passwordPolicyVersions: [
                {
                    customStrengthOptions: JSON.parse(process.env.FB_AUTH_PASSWORD_POLICY),
                },
            ],
        },
        autodeleteAnonymousUsers: true,
    }
    const authPath = join(process.cwd(), "firebase-emulator-data", "auth_export")
    await mkdir(authPath, { recursive: true })
    await writeFile(join(authPath, "config.json"), JSON.stringify(authConfig, null, 4))
    await runChildProcess("firebase", [
        "auth:export",
        join(authPath, "accounts.json"),
        "--project",
        process.env.GCP_PROJECT,
    ])

    await initializeFirebase()
    const rtdb = getDatabase()
    const ref = rtdb.ref("schema")
    const schemaSnapshot = await ref.orderByChild("published_time").limitToLast(1).get()
    const schema = Object.values(schemaSnapshot.val())[0] as CollectionsSchema
    const databasePath = join(process.cwd(), "firebase-emulator-data", "database_export")
    await mkdir(databasePath, { recursive: true })
    await rm(databasePath, { recursive: true, force: true })
    await mkdir(databasePath, { recursive: true })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await writeFile(
        join(databasePath, `${process.env.FB_DATABASE}.json`),
        JSON.stringify(
            {
                schema: {
                    "1": schema,
                },
            },
            null,
            4,
        ),
    )

    const storagePath = join(process.cwd(), "firebase-emulator-data", "storage_export")
    await mkdir(storagePath, { recursive: true })
    await mkdir(join(storagePath, "metadata"), { recursive: true })
    await mkdir(join(storagePath, "blobs"), { recursive: true })
    await writeFile(
        join(storagePath, `buckets.json`),
        JSON.stringify(
            {
                buckets: [
                    {
                        id: process.env.GCP_PROJECT,
                    },
                ],
            },
            null,
            4,
        ),
    )

    const firestorePath = join(process.cwd(), "firebase-emulator-data")
    await runChildProcess("gcloud", [
        "firestore",
        "export",
        `gs://${process.env.GCP_PROJECT}/firestore_export`,
        "--project",
        process.env.GCP_PROJECT,
    ])
    await runChildProcess("gcloud", [
        "storage",
        "cp",
        "-r",
        `gs://${process.env.GCP_PROJECT}/firestore_export`,
        firestorePath,
    ])
    await runChildProcess("gcloud", ["storage", "rm", "-r", `gs://${process.env.GCP_PROJECT}/firestore_export`])

    const firebaseExportMetadata = {
        firestore: {
            path: "firestore_export",
            metadata_file: "firestore_export/firestore_export.overall_export_metadata",
        },
        database: {
            path: "database_export",
        },
        auth: {
            path: "auth_export",
        },
        storage: {
            path: "storage_export",
        },
    }
    await writeFile(
        join(process.cwd(), "firebase-emulator-data", "firebase-export-metadata.json"),
        JSON.stringify(firebaseExportMetadata, null, 4),
    )

    process.exit()
}

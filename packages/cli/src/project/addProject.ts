import { runChildProcess } from "@stoker-platform/node-client"
import { writeFile, unlink, readFile } from "fs/promises"
import { join } from "path"
import dotenv from "dotenv"
import { retryOperation } from "@stoker-platform/utils"
import { SecretManagerServiceClient } from "@google-cloud/secret-manager"
import { addTenant } from "./addTenant.js"
import { existsSync } from "fs"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const addProject = async (options: any) => {
    if (!process.env.GCP_BILLING_ACCOUNT) {
        throw new Error("GCP_BILLING_ACCOUNT not set.")
    }
    if (!process.env.FB_FIRESTORE_REGION) {
        throw new Error("FB_FIRESTORE_REGION not set.")
    }
    if (!process.env.FB_STORAGE_REGION) {
        throw new Error("FB_STORAGE_REGION not set.")
    }
    if (!process.env.FB_DATABASE_REGION) {
        throw new Error("FB_DATABASE_REGION not set.")
    }
    if (!process.env.MAIL_SMTP_PASSWORD) {
        throw new Error("MAIL_SMTP_PASSWORD not set.")
    }
    if (!process.env.FB_AUTH_PASSWORD_POLICY) {
        throw new Error("FB_AUTH_PASSWORD_POLICY not set.")
    }
    if (!process.env.FB_AUTH_PASSWORD_POLICY_UPGRADE) {
        throw new Error("FB_AUTH_PASSWORD_POLICY_UPGRADE not set.")
    }
    if (!process.env.FB_FUNCTIONS_REGION) {
        throw new Error("FB_FUNCTIONS_REGION not set.")
    }
    if (process.env.GCP_PROJECT) {
        throw new Error("GCP_PROJECT should not be set for project creation.")
    }

    const projectEnvFile = join(process.cwd(), ".env", `.env.project.${options.name}`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (existsSync(projectEnvFile)) {
        dotenv.config({ path: projectEnvFile, override: true, quiet: true })
    }
    if (options.development) {
        dotenv.config({ path: join(process.cwd(), ".env", ".env.dev"), override: true, quiet: true })
    }

    const projectId = options.name
    process.env.GCP_PROJECT = projectId

    const projectArgs = ["projects:create", projectId]
    if (process.env.GCP_ORGANIZATION) projectArgs.push("--organization", process.env.GCP_ORGANIZATION)
    if (process.env.GCP_FOLDER) projectArgs.push("--folder", process.env.GCP_FOLDER)

    await runChildProcess("firebase", projectArgs).catch(() => {
        throw new Error("Error creating Google Cloud Project.")
    })

    try {
        await runChildProcess("gcloud", [
            "billing",
            "projects",
            "link",
            projectId,
            `--billing-account=${process.env.GCP_BILLING_ACCOUNT}`,
            "--quiet",
        ]).catch(() => {
            throw new Error("Error enabling billing on project.")
        })

        await runChildProcess("gcloud", [
            "services",
            "enable",
            "firestore.googleapis.com",
            "firebasedatabase.googleapis.com",
            "firebasestorage.googleapis.com",
            "secretmanager.googleapis.com",
            "cloudfunctions.googleapis.com",
            "deploymentmanager.googleapis.com",
            "artifactregistry.googleapis.com",
            "containerregistry.googleapis.com",
            "cloudbuild.googleapis.com",
            "firebaseextensions.googleapis.com",
            "eventarc.googleapis.com",
            "eventarcpublishing.googleapis.com",
            "run.googleapis.com",
            "compute.googleapis.com",
            "maps-backend.googleapis.com",
            "geocoding-backend.googleapis.com",
            "firebaseappcheck.googleapis.com",
            "recaptchaenterprise.googleapis.com",
            "cloudscheduler.googleapis.com",
            `--project=${projectId}`,
            "--quiet",
        ]).catch(() => {
            throw new Error("Error enabling Google Cloud APIs.")
        })

        await runChildProcess("gcloud", [
            "services",
            "enable",
            "aiplatform.googleapis.com",
            "monitoring.googleapis.com",
            "logging.googleapis.com",
            "cloudtrace.googleapis.com",
            `--project=${projectId}`,
            "--quiet",
        ]).catch(() => {
            throw new Error("Error enabling Google Cloud APIs.")
        })

        await runChildProcess("firebase", ["apps:create", "WEB", projectId, "--project", projectId]).catch(() => {
            throw new Error("Error creating Firebase web app.")
        })

        const webAppResult = await runChildProcess("firebase", [
            "apps:sdkconfig",
            "WEB",
            "--project",
            projectId,
            "--json",
        ]).catch(() => {
            throw new Error("Error getting Firebase web app config.")
        })

        const webAppResultJson = JSON.parse(webAppResult)
        const webAppConfig = webAppResultJson.result.sdkConfig
        const appId = webAppConfig.appId
        const projectNumber = webAppConfig.messagingSenderId

        const token = await runChildProcess("gcloud", ["auth", "print-access-token"]).catch(() => {
            throw new Error("Error getting Google Cloud identity token.")
        })

        if (process.env.FB_GOOGLE_ANALYTICS_ACCOUNT_ID && !options.development) {
            const analyticsResponse = await fetch(
                `https://firebase.googleapis.com/v1beta1/projects/${projectId}:addGoogleAnalytics`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "X-Goog-User-Project": projectId,
                    },
                    body: JSON.stringify({
                        analyticsAccountId: process.env.FB_GOOGLE_ANALYTICS_ACCOUNT_ID,
                    }),
                },
            )
            const analyticsResponseJson = await analyticsResponse.json()
            console.log(analyticsResponseJson)
            if (!analyticsResponse.ok) {
                throw new Error("Error adding Google Analytics to Firebase project.")
            }
        }

        const hostingResponse = await fetch(
            `https://firebasehosting.googleapis.com/v1beta1/projects/${projectId}/sites/${projectId}?updateMask=appId`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "X-Goog-User-Project": projectId,
                },
                body: JSON.stringify({
                    appId,
                }),
            },
        )
        const hostingResponseJson = await hostingResponse.json()
        console.log(hostingResponseJson)
        if (!hostingResponse.ok) {
            throw new Error("Error updating Firebase Hosting site web app association.")
        }

        const hostingConfig: {
            cloudLoggingEnabled?: boolean
            maxVersions?: string
        } = {}
        if (process.env.FB_HOSTING_ENABLE_CLOUD_LOGGING === "true") {
            hostingConfig.cloudLoggingEnabled = true
        }
        if (process.env.FB_HOSTING_MAX_VERSIONS) {
            hostingConfig.maxVersions = process.env.FB_HOSTING_MAX_VERSIONS
        }
        if (Object.keys(hostingConfig).length > 0) {
            const hostingConfigResponse = await fetch(
                `https://firebasehosting.googleapis.com/v1beta1/projects/${projectId}/sites/${projectId}/config?updateMask=cloudLoggingEnabled,maxVersions`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "X-Goog-User-Project": projectId,
                    },
                    body: JSON.stringify(hostingConfig),
                },
            )
            const hostingConfigResponseJson = await hostingConfigResponse.json()
            console.log(hostingConfigResponseJson)
            if (!hostingConfigResponse.ok) {
                throw new Error("Error updating Firebase Hosting site web app config.")
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 10000))

        await retryOperation(
            async () => {
                const rtdb = await fetch(
                    `https://firebasedatabase.googleapis.com/v1beta/projects/${projectId}/locations/${process.env.FB_DATABASE_REGION}/instances?key=${webAppConfig.apiKey}`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: "application/json",
                            "Content-Type": "application/json",
                            "X-Goog-User-Project": projectId,
                        },
                        body: JSON.stringify({
                            type: "DEFAULT_DATABASE",
                        }),
                    },
                ).catch(() => {
                    throw new Error("Error creating Firebase Realtime Database instance.")
                })
                const rtdbResponse = await rtdb.json()
                console.log(rtdbResponse)
                if (!rtdb.ok) {
                    throw new Error("Error creating Firebase Realtime Database instance.")
                } else {
                    webAppConfig.databaseURL = rtdbResponse.databaseUrl
                }
            },
            [],
            undefined,
            5000,
        )

        await new Promise((resolve) => setTimeout(resolve, 10000))

        await retryOperation(
            async () => {
                await runChildProcess("gcloud", [
                    "firestore",
                    "databases",
                    "create",
                    `--location=${process.env.FB_FIRESTORE_REGION}`,
                    "--type=firestore-native",
                    "--delete-protection",
                    options.pitr && process.env.FB_FIRESTORE_ENABLE_PITR !== "false"
                        ? "--enable-pitr"
                        : "--no-enable-pitr",
                    `--project=${projectId}`,
                    "--quiet",
                ]).catch(() => {
                    throw new Error("Error creating Firestore database.")
                })
            },
            [],
            undefined,
            5000,
        )

        await new Promise((resolve) => setTimeout(resolve, 10000))

        const backupArguments = [
            "firestore",
            "backups",
            "schedules",
            "create",
            options.backupRecurrence
                ? `--recurrence=${options.backupRecurrence}`
                : process.env.FB_FIRESTORE_BACKUP_RECURRENCE
                  ? `--recurrence=${process.env.FB_FIRESTORE_BACKUP_RECURRENCE}`
                  : "--recurrence=daily",
            options.backupRetention
                ? `--retention=${options.backupRetention}`
                : process.env.FB_FIRESTORE_BACKUP_RETENTION
                  ? `--retention=${process.env.FB_FIRESTORE_BACKUP_RETENTION}`
                  : "--retention=7d",
            "--database=(default)",
            `--project=${projectId}`,
            "--quiet",
        ]
        if (process.env.FB_FIRESTORE_BACKUP_RECURRENCE === "weekly" || options.backupRecurrence === "weekly")
            backupArguments.push("--day-of-week=SUN")

        await retryOperation(
            async () => {
                await runChildProcess("gcloud", backupArguments).catch(() => {
                    throw new Error("Error creating Firestore database.")
                })
            },
            [],
            undefined,
            5000,
        )

        await runChildProcess("gcloud", [
            "storage",
            "buckets",
            "create",
            `gs://${projectId}`,
            "--default-storage-class=standard",
            `--location=${process.env.FB_STORAGE_REGION}`,
            `--project=${projectId}`,
            "--public-access-prevention",
            options.softDelete
                ? `--soft-delete-duration=${options.softDelete}`
                : process.env.FB_STORAGE_SOFT_DELETE_DURATION
                  ? `--soft-delete-duration=${process.env.FB_STORAGE_SOFT_DELETE_DURATION}`
                  : "--soft-delete-duration=30d",
            "--quiet",
        ]).catch(() => {
            throw new Error("Error creating Cloud Storage Bucket.")
        })
        if (options.versioning && process.env.FB_STORAGE_ENABLE_VERSIONING !== "false") {
            await runChildProcess("gcloud", [
                "storage",
                "buckets",
                "update",
                `gs://${projectId}`,
                "--versioning",
                `--project=${projectId}`,
                "--quiet",
            ]).catch(() => {
                throw new Error("Error enabling Cloud Storage versioning.")
            })
        }
        await writeFile(
            "cors.json",
            process.env.FB_STORAGE_CORS
                ? process.env.FB_STORAGE_CORS
                : JSON.stringify([
                      {
                          origin: [`https://${projectId}.web.app`, `https://${projectId}.firebaseapp.com`],
                          method: ["GET"],
                          maxAgeSeconds: 3600,
                      },
                  ]),
        )
        await runChildProcess("gcloud", [
            "storage",
            "buckets",
            "update",
            `gs://${projectId}`,
            "--cors-file",
            options.customCors || "cors.json",
            `--project=${projectId}`,
            "--quiet",
        ]).catch(() => {
            throw new Error("Error enabling Cloud Storage CORS.")
        })
        await unlink(join(process.cwd(), "cors.json"))

        await runChildProcess("gcloud", [
            "storage",
            "buckets",
            "create",
            `gs://${projectId}-export`,
            "--default-storage-class=standard",
            `--location=${process.env.FB_STORAGE_REGION}`,
            `--project=${projectId}`,
            "--public-access-prevention",
            options.softDelete
                ? `--soft-delete-duration=${options.softDelete}`
                : process.env.FB_STORAGE_SOFT_DELETE_DURATION
                  ? `--soft-delete-duration=${process.env.FB_STORAGE_SOFT_DELETE_DURATION}`
                  : "--soft-delete-duration=30d",
            "--quiet",
        ]).catch(() => {
            throw new Error("Error creating Cloud Storage export Bucket.")
        })

        const storageResponse = await fetch(
            `https://firebasestorage.googleapis.com/v1beta/projects/${projectId}/buckets/${projectId}:addFirebase`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "X-Goog-User-Project": projectId,
                },
                body: "{}",
            },
        )
        const storageResponseJson = await storageResponse.json()
        console.log(storageResponseJson)
        if (!storageResponse.ok) {
            throw new Error("Error adding Firebase to Cloud Storage.")
        }

        await runChildProcess("firebase", ["target:apply", "storage", "default", projectId, "--project", projectId])

        await retryOperation(
            async () => {
                await runChildProcess("gcloud", [
                    "projects",
                    "add-iam-policy-binding",
                    projectId,
                    "--member",
                    `serviceAccount:service-${projectNumber}@gcp-sa-firebasestorage.iam.gserviceaccount.com`,
                    "--role",
                    "roles/firebaserules.firestoreServiceAgent",
                    "--quiet",
                ]).catch(() => {
                    throw new Error("Error attaching Firebase Storage Rules permissions.")
                })
            },
            [],
            undefined,
            5000,
        )

        await retryOperation(
            async () => {
                await runChildProcess("gcloud", [
                    "projects",
                    "add-iam-policy-binding",
                    projectId,
                    "--member",
                    `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
                    "--role",
                    "roles/monitoring.metricWriter",
                    "--quiet",
                ]).catch(() => {
                    throw new Error("Error attaching GenKit permissions.")
                })
            },
            [],
            undefined,
            5000,
        )
        await retryOperation(
            async () => {
                await runChildProcess("gcloud", [
                    "projects",
                    "add-iam-policy-binding",
                    projectId,
                    "--member",
                    `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
                    "--role",
                    "roles/cloudtrace.agent",
                    "--quiet",
                ]).catch(() => {
                    throw new Error("Error attaching GenKit permissions.")
                })
            },
            [],
            undefined,
            5000,
        )
        await retryOperation(
            async () => {
                await runChildProcess("gcloud", [
                    "projects",
                    "add-iam-policy-binding",
                    projectId,
                    "--member",
                    `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
                    "--role",
                    "roles/logging.logWriter",
                    "--quiet",
                ]).catch(() => {
                    throw new Error("Error attaching GenKit permissions.")
                })
            },
            [],
            undefined,
            5000,
        )
        await retryOperation(
            async () => {
                await runChildProcess("gcloud", [
                    "projects",
                    "add-iam-policy-binding",
                    projectId,
                    "--member",
                    `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
                    "--role",
                    "roles/iam.serviceAccountTokenCreator",
                    "--quiet",
                ]).catch(() => {
                    throw new Error("Error attaching GenKit permissions.")
                })
            },
            [],
            undefined,
            5000,
        )

        webAppConfig.storageBucket = `gs://${projectId}`

        const identity = await fetch(
            `https://identitytoolkit.googleapis.com/v2/projects/${projectId}/identityPlatform:initializeAuth`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    "X-Goog-User-Project": projectId,
                },
            },
        )
        const identityResponse = await identity.json()
        console.log(identityResponse)
        if (!identity.ok) {
            throw new Error("Error setting up Firebase Auth.")
        }

        const auth = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-Goog-User-Project": projectId,
            },
            body: JSON.stringify({
                signIn: {
                    email: {
                        enabled: true,
                        passwordRequired: true,
                    },
                    allowDuplicateEmails: false,
                },
                authorizedDomains: [`${projectId}.web.app`, `${projectId}.firebaseapp.com`],
                client: {
                    permissions: {
                        disabledUserSignup: true,
                        disabledUserDeletion: true,
                    },
                },
                monitoring: {
                    requestLogging: {
                        enabled: true,
                    },
                },
                mfa: {
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
            }),
        })
        const authResponse = await auth.json()
        console.log(authResponse)
        if (!auth.ok) {
            throw new Error("Error setting up Firebase Auth.")
        }

        const secretManager = new SecretManagerServiceClient()

        if (process.env.ALGOLIA_ADMIN_KEY) {
            const [algoliaSecret] = await secretManager.createSecret({
                parent: `projects/${projectId}`,
                secret: {
                    name: "ALGOLIA_ADMIN_KEY",
                    replication: {
                        automatic: {},
                    },
                },
                secretId: "ALGOLIA_ADMIN_KEY",
            })
            const [algoliaSecretVersion] = await secretManager.addSecretVersion({
                parent: algoliaSecret.name,
                payload: {
                    data: Buffer.from(process.env.ALGOLIA_ADMIN_KEY, "utf8"),
                },
            })
            console.log(algoliaSecretVersion)
        }
        const [smtpPasswordSecret] = await secretManager.createSecret({
            parent: `projects/${projectId}`,
            secret: {
                name: "firestore-send-email-SMTP_PASSWORD",
                replication: {
                    automatic: {},
                },
            },
            secretId: "firestore-send-email-SMTP_PASSWORD",
        })
        const [smtpPasswordSecretVersion] = await secretManager.addSecretVersion({
            parent: smtpPasswordSecret.name,
            payload: {
                data: Buffer.from(process.env.MAIL_SMTP_PASSWORD, "utf8"),
            },
        })
        console.log(smtpPasswordSecretVersion)
        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
            const [twilioPasswordSecret] = await secretManager.createSecret({
                parent: `projects/${projectId}`,
                secret: {
                    name: "TWILIO_AUTH_TOKEN",
                    replication: {
                        automatic: {},
                    },
                },
                secretId: "TWILIO_AUTH_TOKEN",
            })
            const [twilioPasswordSecretVersion] = await secretManager.addSecretVersion({
                parent: twilioPasswordSecret.name,
                payload: {
                    data: Buffer.from(process.env.TWILIO_AUTH_TOKEN, "utf8"),
                },
            })
            console.log(twilioPasswordSecretVersion)

            const [twilioAccountSidSecret] = await secretManager.createSecret({
                parent: `projects/${projectId}`,
                secret: {
                    name: "TWILIO_ACCOUNT_SID",
                    replication: {
                        automatic: {},
                    },
                },
                secretId: "TWILIO_ACCOUNT_SID",
            })
            const [twilioAccountSidSecretVersion] = await secretManager.addSecretVersion({
                parent: twilioAccountSidSecret.name,
                payload: {
                    data: Buffer.from(process.env.TWILIO_ACCOUNT_SID, "utf8"),
                },
            })
            console.log(twilioAccountSidSecretVersion)

            const [twilioPhoneNumberSecret] = await secretManager.createSecret({
                parent: `projects/${projectId}`,
                secret: {
                    name: "TWILIO_PHONE_NUMBER",
                    replication: {
                        automatic: {},
                    },
                },
                secretId: "TWILIO_PHONE_NUMBER",
            })
            const [twilioPhoneNumberSecretVersion] = await secretManager.addSecretVersion({
                parent: twilioPhoneNumberSecret.name,
                payload: {
                    data: Buffer.from(process.env.TWILIO_PHONE_NUMBER, "utf8"),
                },
            })
            console.log(twilioPhoneNumberSecretVersion)
        }

        const externalSecrets = JSON.parse(process.env.EXTERNAL_SECRETS || "{}")
        for (const [secretName, secretValue] of Object.entries(externalSecrets)) {
            const [externalSecret] = await secretManager.createSecret({
                parent: `projects/${projectId}`,
                secret: {
                    name: secretName,
                    replication: {
                        automatic: {},
                    },
                },
                secretId: secretName,
            })
            const [secretVersion] = await secretManager.addSecretVersion({
                parent: externalSecret.name,
                payload: {
                    data: Buffer.from(secretValue as string, "utf8"),
                },
            })
            console.log(secretVersion)
        }

        const apiKeys = await runChildProcess("gcloud", [
            "services",
            "api-keys",
            "list",
            `--project=${projectId}`,
            "--quiet",
            "--format=json",
        ])
        const apiKeysJson = JSON.parse(apiKeys)
        const apiKey = apiKeysJson[0]
        if (!apiKey) {
            throw new Error("Error getting Firebase API key.")
        }

        let allowedReferrers = `--allowed-referrers=https://${projectId}.web.app,https://${projectId}.firebaseapp.com`
        if (options.development) {
            allowedReferrers = `--allowed-referrers=https://${projectId}.web.app,https://${projectId}.firebaseapp.com,http://localhost`
        }

        const apiKeyUpdateArgs = [
            "services",
            "api-keys",
            "update",
            apiKey.uid,
            "--api-target=service=maps-backend.googleapis.com",
            "--api-target=service=geocoding-backend.googleapis.com",
            allowedReferrers,
            `--project=${projectId}`,
            "--quiet",
        ]
        apiKey.restrictions.apiTargets.forEach((target: { service: string }) =>
            apiKeyUpdateArgs.push(`--api-target=service=${target.service}`),
        )

        await runChildProcess("gcloud", apiKeyUpdateArgs)

        const recaptchaResponse = await fetch(
            `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/keys`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "X-Goog-User-Project": projectId,
                },
                body: JSON.stringify({
                    displayName: "Firebase App Check",
                    webSettings: {
                        allowedDomains: [`${projectId}.web.app`, `${projectId}.firebaseapp.com`],
                        integrationType: "SCORE",
                    },
                }),
            },
        )
        const recaptchaResponseJson = await recaptchaResponse.json()
        console.log(recaptchaResponseJson)
        if (!recaptchaResponse.ok) {
            throw new Error("Failed to create Recaptcha key")
        }

        const recaptchaKey = recaptchaResponseJson.name
        const recaptchaKeyId = recaptchaKey.split("/").pop()

        const recaptchaEnterpriseConfig = await fetch(
            `https://firebaseappcheck.googleapis.com/v1beta/projects/${projectId}/apps/${appId}/recaptchaEnterpriseConfig?updateMask=siteKey,tokenTtl`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "X-Goog-User-Project": projectId,
                },
                body: JSON.stringify({
                    siteKey: recaptchaKeyId,
                    tokenTtl: process.env.FB_APP_CHECK_TOKEN_TTL || "3600s",
                }),
            },
        )
        const recaptchaEnterpriseConfigJson = await recaptchaEnterpriseConfig.json()
        console.log(recaptchaEnterpriseConfigJson)
        if (!recaptchaEnterpriseConfig.ok) {
            throw new Error("Failed to create Recaptcha Enterprise config")
        }

        if (process.env.FB_ENABLE_APP_CHECK === "true") {
            const servicesResponse = await fetch(
                `https://firebaseappcheck.googleapis.com/v1beta/projects/${projectId}/services:batchUpdate`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "X-Goog-User-Project": projectId,
                    },
                    body: JSON.stringify({
                        requests: [
                            {
                                service: {
                                    name: `projects/${projectId}/services/identitytoolkit.googleapis.com`,
                                    enforcementMode: "ENFORCED",
                                },
                                updateMask: "enforcementMode",
                            },
                            {
                                service: {
                                    name: `projects/${projectId}/services/firestore.googleapis.com`,
                                    enforcementMode: "ENFORCED",
                                },
                                updateMask: "enforcementMode",
                            },
                            {
                                service: {
                                    name: `projects/${projectId}/services/firebasedatabase.googleapis.com`,
                                    enforcementMode: "ENFORCED",
                                },
                                updateMask: "enforcementMode",
                            },
                            {
                                service: {
                                    name: `projects/${projectId}/services/firebasestorage.googleapis.com`,
                                    enforcementMode: "ENFORCED",
                                },
                                updateMask: "enforcementMode",
                            },
                            {
                                service: {
                                    name: `projects/${projectId}/services/maps-backend.googleapis.com`,
                                    enforcementMode: "ENFORCED",
                                },
                                updateMask: "enforcementMode",
                            },
                        ],
                    }),
                },
            )
            const servicesResponseJson = await servicesResponse.json()
            console.log(servicesResponseJson)
            if (!servicesResponse.ok) {
                throw new Error("Failed to update App Check services")
            }
        }

        const firebaseJson = JSON.parse(await readFile(join(process.cwd(), "firebase.json"), "utf8"))
        const authPort = firebaseJson.emulators.auth.port
        const databasePort = firebaseJson.emulators.database.port
        const firestorePort = firebaseJson.emulators.firestore.port
        const storagePort = firebaseJson.emulators.storage.port
        const functionsPort = firebaseJson.emulators.functions.port

        const envDir = join(process.cwd(), ".env")
        const envFile = join(envDir, `.env.${projectId}`)

        let envContent = `STOKER_FB_WEB_APP_CONFIG='${JSON.stringify(webAppConfig)}'
STOKER_FB_ENABLE_APP_CHECK=${process.env.FB_ENABLE_APP_CHECK}
STOKER_FB_APP_CHECK_KEY="${recaptchaKeyId}"
STOKER_ALGOLIA_ID="${process.env.ALGOLIA_ID || ""}"
STOKER_FB_FUNCTIONS_REGION="${process.env.FB_FUNCTIONS_REGION}"
FB_DATABASE="${projectId}-default-rtdb"
FB_FIRESTORE_EXPORT_BUCKET="${projectId}-export"`

        if (process.env.SENTRY_DSN) {
            envContent += `\nSTOKER_SENTRY_DSN="${process.env.SENTRY_DSN}"`
        }

        if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
            envContent += `\nSTOKER_SMS_ENABLED=true`
        }

        if (process.env.FULLCALENDAR_KEY) {
            envContent += `\nSTOKER_FULLCALENDAR_KEY="${process.env.FULLCALENDAR_KEY}"`
        }

        if (options.development) {
            envContent += `
STOKER_FB_EMULATOR_AUTH_PORT=${authPort}
STOKER_FB_EMULATOR_DATABASE_PORT=${databasePort}
STOKER_FB_EMULATOR_FIRESTORE_PORT=${firestorePort}
STOKER_FB_EMULATOR_STORAGE_PORT=${storagePort}
STOKER_FB_EMULATOR_FUNCTIONS_PORT=${functionsPort}`
        }

        // eslint-disable-next-line security/detect-non-literal-fs-filename
        await writeFile(envFile, envContent)

        dotenv.config({ path: join(process.cwd(), ".env", `.env.${projectId}`), quiet: true })

        await runChildProcess("npx", ["stoker", "deploy", "--initial"])

        if (!options.testMode) {
            const projectData = JSON.parse(await readFile(join(process.cwd(), "project-data.json"), "utf8"))
            projectData.projects.push(projectId)
            await writeFile(join(process.cwd(), "project-data.json"), JSON.stringify(projectData, null, 4))
        }

        await runChildProcess("npx", ["stoker", "set-project"])

        await addTenant()

        process.exit()
    } catch {
        await runChildProcess("npx", ["stoker", "delete-project"])
        process.exit(1)
    }
}

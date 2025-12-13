import { runChildProcess } from "@stoker-platform/node-client"
import { unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const customDomain = async (options: any) => {
    if (!process.env.GCP_PROJECT) {
        throw new Error("GCP_PROJECT environment variable is not set.")
    }
    const projectId = process.env.GCP_PROJECT

    const token = await runChildProcess("gcloud", ["auth", "print-access-token"]).catch(() => {
        throw new Error("Error getting Google Cloud identity token.")
    })

    const hostingResponse = await fetch(
        `https://firebasehosting.googleapis.com/v1beta1/projects/${projectId}/sites/${projectId}/customDomains?parent=projects/${projectId}/sites/${projectId}&customDomainId=${options.domain}`,
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
    const hostingResponseJson = await hostingResponse.json()
    console.log(hostingResponseJson)
    if (!hostingResponse.ok) {
        throw new Error("Error adding custom domain.")
    }

    const listKeysResponse = await fetch(`https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/keys`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Goog-User-Project": projectId,
        },
    })
    const listKeysJson = await listKeysResponse.json()

    const appCheckKey = listKeysJson.keys?.find(
        (key: { displayName: string }) => key.displayName === "Firebase App Check",
    )
    if (!appCheckKey) {
        throw new Error("Could not find existing App Check key")
    }

    const recaptchaResponse = await fetch(
        `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/keys/${appCheckKey.name.split("/").pop()}?updateMask=webSettings.allowedDomains`,
        {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "X-Goog-User-Project": projectId,
            },
            body: JSON.stringify({
                webSettings: {
                    ...appCheckKey.webSettings,
                    allowedDomains: [...(appCheckKey.webSettings.allowedDomains || []), options.domain],
                },
            }),
        },
    )
    const recaptchaResponseJson = await recaptchaResponse.json()
    console.log(recaptchaResponseJson)
    if (!recaptchaResponse.ok) {
        throw new Error("Failed to update Recaptcha key")
    }

    const authResponse = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-Goog-User-Project": projectId,
        },
    })
    const authResponseJson = await authResponse.json()
    console.log(authResponseJson)
    if (!authResponse.ok) {
        throw new Error("Error getting Firebase Auth authorized domains.")
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
            ...authResponseJson,
            authorizedDomains: [...(authResponseJson.authorizedDomains || []), options.domain],
        }),
    })
    const authUpdateResponse = await auth.json()
    console.log(authUpdateResponse)
    if (!auth.ok) {
        throw new Error("Error updating Firebase Auth authorized domains.")
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

    const allowedReferrers = `--allowed-referrers=${[...apiKey.restrictions.browserKeyRestrictions.allowedReferrers, `https://${options.domain}`].join(",")}`

    const apiKeyUpdateArgs = [
        "services",
        "api-keys",
        "update",
        apiKey.uid,
        allowedReferrers,
        `--project=${projectId}`,
        "--quiet",
    ]

    await runChildProcess("gcloud", apiKeyUpdateArgs)

    if (!process.env.FB_STORAGE_CORS) {
        const corsConfigString = await runChildProcess("gcloud", [
            "storage",
            "buckets",
            "describe",
            `gs://${projectId}`,
            `--project=${projectId}`,
            "--format=json",
        ])
        const corsConfigJson = JSON.parse(corsConfigString)
        const existingCors = corsConfigJson.cors || []

        const allOrigins = new Set()
        for (const corsEntry of existingCors) {
            if (corsEntry.origin) {
                for (const origin of corsEntry.origin) {
                    allOrigins.add(origin)
                }
            }
        }
        allOrigins.add(`https://${options.domain}`)

        const corsToWrite = [
            {
                origin: Array.from(allOrigins),
                method: ["GET"],
                maxAgeSeconds: 3600,
            },
        ]

        await writeFile("cors.json", JSON.stringify(corsToWrite))

        await runChildProcess("gcloud", [
            "storage",
            "buckets",
            "update",
            `gs://${projectId}`,
            "--cors-file",
            "cors.json",
            `--project=${projectId}`,
            "--quiet",
        ]).catch(() => {
            throw new Error("Error updating Cloud Storage CORS.")
        })
        await unlink(join(process.cwd(), "cors.json"))
    }
}

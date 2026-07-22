import { initializeFirebase } from "@stoker-platform/node-client"
import { GlobalConfig, StokerRole } from "@stoker-platform/types"
import { getAuth } from "firebase-admin/auth"
import { join } from "path"
import { pathToFileURL } from "url"

const roleRequiresMfa = (enableMultiFactorAuth: boolean | StokerRole[], role: string | undefined) => {
    if (enableMultiFactorAuth === true) return true
    if (enableMultiFactorAuth === false) return false
    return !!role && enableMultiFactorAuth.includes(role as StokerRole)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mfaStatus = async (options: any) => {
    const statusFilter = options.status as string | undefined
    if (statusFilter && statusFilter !== "enabled" && statusFilter !== "disabled") {
        console.error('Invalid status. Use "enabled" or "disabled".')
        process.exit(1)
    }

    const path = join(process.cwd(), "lib", "main.js")
    const url = pathToFileURL(path).href
    const globalConfigFile = await import(url)
    const globalConfig: GlobalConfig = globalConfigFile.default({ sdk: "node" })
    const enableMultiFactorAuth = globalConfig.auth.enableMultiFactorAuth

    await initializeFirebase()
    const auth = getAuth()
    const results: {
        uid: string
        email: string | null
        mfaEnabled: boolean
        enrolledFactors: string[]
    }[] = []
    let pageToken: string | undefined
    do {
        const list = await auth.listUsers(1000, pageToken)
        for (const user of list.users) {
            const role = user.customClaims?.role as string | undefined
            if (!roleRequiresMfa(enableMultiFactorAuth, role)) continue

            const factors = user.multiFactor?.enrolledFactors ?? []
            const mfaEnabled = factors.length > 0
            if (statusFilter === "enabled" && !mfaEnabled) continue
            if (statusFilter === "disabled" && mfaEnabled) continue
            results.push({
                uid: user.uid,
                email: user.email ?? null,
                mfaEnabled,
                enrolledFactors: factors.map((factor) => factor.factorId),
            })
        }
        pageToken = list.pageToken
    } while (pageToken)
    const lines = results.map((user) => {
        const email = user.email ?? "(no email)"
        const status = user.mfaEnabled ? "enabled" : "DISABLED"
        const factors = user.enrolledFactors.length > 0 ? ` [${user.enrolledFactors.join(", ")}]` : ""
        return `${email} (${user.uid}): ${status}${factors}`
    })
    console.log(lines.join("\n"))
    process.exit()
}

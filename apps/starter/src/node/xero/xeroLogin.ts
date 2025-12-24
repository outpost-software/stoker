import { sendMail } from "@stoker-platform/node-client"
import { StokerRecord } from "@stoker-platform/types"
import { getFirestore } from "firebase-admin/firestore"
import { XeroClient, TokenSet } from "xero-node"

const appName = "Outpost Interactive"
const redirectUris = [
    //    "http://localhost:5001/oi-development-v9/australia-southeast2/stoker-xero",
    "https://australia-southeast2-oi-development-v9.cloudfunctions.net/stoker-xero",
]

export const saveXeroTokenSet = async (tokenSet: TokenSet) => {
    const db = getFirestore()
    await db
        .collection("system_xero")
        .doc("token")
        .set({ XeroTokenSet: JSON.parse(JSON.stringify(tokenSet)) })
    console.log("Xero Token Saved")
    return
}

export const xeroLogin = async (
    clientId: string,
    clientSecret: string,
    sendEmail: boolean = false,
): Promise<{ xero: XeroClient; xeroTenantId: string | null }> => {
    const db = getFirestore()

    const xero = new XeroClient({
        clientId,
        clientSecret,
        redirectUris,
        // eslint-disable-next-line max-len
        scopes: "openid profile email accounting.transactions accounting.contacts accounting.settings offline_access".split(
            " ",
        ),
        httpTimeout: 10000,
        clockTolerance: 10,
    })

    await xero.initialize()
    const snapshot = await db.collection("system_xero").doc("token").get()
    const settings = snapshot.data() as StokerRecord
    if (settings?.XeroTokenSet) {
        const tokenSet = settings.XeroTokenSet
        await xero.setTokenSet(tokenSet)
        const validTokenSet = await xero.refreshToken()
        await saveXeroTokenSet(validTokenSet)
        await xero.setTokenSet(validTokenSet)
        await xero.updateTenants()
        if (xero.tenants && xero.tenants[0] && xero.tenants[0].tenantId) {
            return { xero: xero, xeroTenantId: xero.tenants[0].tenantId }
        }
    } else if (sendEmail) {
        const consentUrl = await xero.buildConsentUrl()
        if (!process.env.ADMIN_EMAIL) return { xero: xero, xeroTenantId: null }
        await sendMail(process.env.ADMIN_EMAIL, `${appName} - Xero Login`, consentUrl)
    }
    return { xero: xero, xeroTenantId: null }
}

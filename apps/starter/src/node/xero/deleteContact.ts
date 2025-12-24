import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { error as errorLogger } from "firebase-functions/logger"
import { xeroLogin } from "./xeroLogin.js"
import { HttpsError } from "firebase-functions/v2/https"
import { getOne, initializeStoker } from "@stoker-platform/node-client"
import { join } from "path"
import { xeroError } from "./xeroError.js"

export const deleteContact = (
    tenantId: string,
    record: StokerRecord,
    collectionSchema: CollectionSchema,
    xeroId: string,
    xeroSecret: string,
    user: string,
) => {
    return (async () => {
        if (!record.Xero_ID) return

        await initializeStoker(
            "production",
            tenantId,
            join(process.cwd(), "lib", "system-custom", "main.js"),
            join(process.cwd(), "lib", "system-custom", "collections"),
            true,
        )

        const latestRecord = await getOne([collectionSchema.labels.collection], record.id, { user }).catch((error) => {
            errorLogger(error)
            throw new HttpsError("internal", "Error reading data")
        })
        record.Xero_ID = latestRecord.Xero_ID

        const { xero, xeroTenantId } = await xeroLogin(xeroId, xeroSecret)
        if (!xeroTenantId) {
            errorLogger("Not logged in to Xero")
            return
        }

        const contact = {
            contactID: record.Xero_ID,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            contactStatus: "ARCHIVED" as any,
        }
        try {
            await xero.accountingApi.updateContact(xeroTenantId, record.Xero_ID, { contacts: [contact] })
        } catch (error) {
            errorLogger(error)
            throw xeroError(error)
        }
        return
    })()
}

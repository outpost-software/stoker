import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { error as errorLogger } from "firebase-functions/logger"
import { xeroLogin } from "./xeroLogin.js"
import { HttpsError } from "firebase-functions/v2/https"
import { getOne, initializeStoker } from "@stoker-platform/node-client"
import { join } from "path"
import { xeroError } from "./xeroError.js"
import { Invoice } from "xero-node"

/* eslint-disable max-len */

const prefix = ""
const unitdp = 2

export const deleteInvoice = (
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

        let invoice: Invoice | undefined
        try {
            const response = await xero.accountingApi.getInvoice(xeroTenantId, record.Xero_ID, unitdp)
            invoice = response.body.invoices?.[0]
        } catch (error) {
            errorLogger(error)
            throw xeroError(error)
        }

        if (invoice) {
            invoice.invoiceID = record.Xero_ID
            if (prefix) {
                invoice.invoiceNumber = prefix + record.Number
            } else {
                invoice.invoiceNumber = record.Number
            }
            /* eslint-disable @typescript-eslint/no-explicit-any */
            if (invoice.status === ("VOIDED" as any) || invoice.status === ("DELETED" as any)) return
            else if (invoice.status === ("DRAFT" as any) || invoice.status === ("AUTHORISED" as any)) {
                if (invoice.status === ("DRAFT" as any)) {
                    invoice.status = "DELETED" as any
                } else if (invoice.status === ("AUTHORISED" as any)) {
                    invoice.status = "VOIDED" as any
                }
                try {
                    await xero.accountingApi.updateInvoice(
                        xeroTenantId,
                        record.Xero_ID,
                        { invoices: [invoice] },
                        unitdp,
                    )
                } catch (error) {
                    errorLogger(error)
                    throw xeroError(error)
                }
            } else {
                throw new Error(
                    "VALIDATION_ERROR: Xero returned an error: Invoice is not of a valid status to delete. Status: " +
                        invoice.status,
                )
            }
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }
        return
    })()
}

import { CollectionSchema, CollectionsSchema, RelationField, StokerRecord } from "@stoker-platform/types"
import { getField } from "@stoker-platform/utils"
import { populateContact } from "./populateContact.js"
import { error as errorLogger } from "firebase-functions/logger"
import { xeroLogin } from "./xeroLogin.js"
import { getOne, initializeStoker, updateRecord, keepTimezone } from "@stoker-platform/node-client"
import { getLineItems } from "./getLineItems.js"
import { Invoice } from "xero-node"
import { join } from "path"
import { HttpsError } from "firebase-functions/v2/https"
import { xeroError } from "./xeroError.js"
import { getFirestore } from "firebase-admin/firestore"

/* eslint-disable max-len */

const region = ""
const contactField = "Client"
const summarizeErrors = true
const unitdp = 2

export const updateInvoice = (
    tenantId: string,
    record: StokerRecord,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    xeroId: string,
    xeroSecret: string,
    user: string,
) => {
    return (async () => {
        if (!record.Xero_ID) return

        const db = getFirestore()

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

        const updateInvoice = async (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            lineItems: Record<string, any>[] | null,
            invoice: Invoice,
            company: StokerRecord,
        ) => {
            if (lineItems) {
                const linesList = getLineItems(lineItems)
                if (linesList.length > 0) {
                    invoice.lineItems = linesList
                } else {
                    invoice.lineItems = [{ description: "" }]
                }
            } else {
                invoice.lineItems = [{ description: "" }]
            }

            invoice.reference = record.Ref
            invoice.contact = { contactID: company.Xero_ID }
            invoice.date = keepTimezone(record.Issued_Date.toDate(), "Australia/Melbourne").toISOString() ?? undefined
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            invoice.type = "ACCREC" as any
            invoice.dueDate = keepTimezone(record.Due_Date.toDate(), "Australia/Melbourne").toISOString() ?? undefined

            delete invoice.amountDue
            delete invoice.amountPaid
            delete invoice.amountCredited

            await xero.accountingApi.updateOrCreateInvoices(
                xeroTenantId,
                { invoices: [invoice] },
                summarizeErrors,
                unitdp,
            )
        }

        const prepareInvoice = async (invoice: Invoice, company: StokerRecord) => {
            let regionName = null
            if (region) {
                regionName = region
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lineItems: Record<string, any>[] = record.Billing_Line_Items?.map((lineItem: Record<string, any>) => {
                lineItem.region = regionName
                return lineItem
            })
            await updateInvoice(lineItems, invoice, company)
        }

        const getInvoice = async (company: StokerRecord) => {
            if (!record.Xero_ID) {
                errorLogger("Invoice not found in Xero")
                throw new HttpsError("internal", "Invoice not found in Xero")
            }
            const response = await xero.accountingApi.getInvoice(xeroTenantId, record.Xero_ID, unitdp)
            const invoice = response.body.invoices?.[0]
            if (!invoice) throw new Error("Invoice not found in Xero")
            await prepareInvoice(invoice, company)
        }

        const contactFieldSchema = getField(collectionSchema.fields, contactField) as RelationField
        const contactsCollection = schema.collections[contactFieldSchema.collection]
        // eslint-disable-next-line security/detect-object-injection
        const contactId = Object.keys(record[contactField])[0]
        const doc = await db
            .collection("tenants")
            .doc(tenantId)
            .collection(contactsCollection.labels.collection)
            .doc(contactId)
            .get()
        const company = doc.data() as StokerRecord
        if (!company) {
            errorLogger("Company not found")
            throw new HttpsError("internal", "Company not found")
        }
        if (!company.Xero_ID) {
            try {
                const contact = populateContact(company)
                const response = await xero.accountingApi.createContacts(
                    xeroTenantId,
                    { contacts: [contact] },
                    summarizeErrors,
                )
                await updateRecord([contactsCollection.labels.collection], contactId, {
                    Xero_ID: response.body.contacts?.[0].contactID,
                })
                company.Xero_ID = response.body.contacts?.[0].contactID
                await getInvoice(company)
            } catch (error) {
                errorLogger(error)
                throw xeroError(error)
            }
        } else {
            try {
                await getInvoice(company)
            } catch (error) {
                errorLogger(error)
                throw xeroError(error)
            }
        }
        return
    })()
}

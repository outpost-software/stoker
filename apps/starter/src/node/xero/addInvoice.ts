import { CollectionSchema, CollectionsSchema, RelationField, StokerRecord } from "@stoker-platform/types"
import { getField } from "@stoker-platform/utils"
import { getFirestore } from "firebase-admin/firestore"
import { populateContact } from "./populateContact.js"
import { error as errorLogger } from "firebase-functions/logger"
import { xeroLogin } from "./xeroLogin.js"
import { initializeStoker, updateRecord, keepTimezone } from "@stoker-platform/node-client"
import { getLineItems } from "./getLineItems.js"
import { Invoice } from "xero-node"
import { join } from "path"
import { HttpsError } from "firebase-functions/v2/https"
import { xeroError } from "./xeroError.js"

/* eslint-disable max-len */

const prefix = ""
const region = ""
const contactField = "Client"
const summarizeErrors = true
const unitdp = 2

export const addInvoice = (
    tenantId: string,
    record: StokerRecord,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    xeroId: string,
    xeroSecret: string,
) => {
    return (async () => {
        if (prefix) {
            record.Number = prefix + record.Number
        }

        const db = getFirestore()

        await initializeStoker(
            "production",
            tenantId,
            join(process.cwd(), "lib", "system-custom", "main.js"),
            join(process.cwd(), "lib", "system-custom", "collections"),
            true,
        )

        const { xero, xeroTenantId } = await xeroLogin(xeroId, xeroSecret, true)
        if (!xeroTenantId) {
            errorLogger("Not logged in to Xero")
            return
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const addInvoice = async (lineItems: Record<string, any>[] | null, company: StokerRecord) => {
            const invoice = {} as Invoice

            if (record.Copy && lineItems) {
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
            invoice.invoiceNumber = record.Number
            invoice.dueDate = keepTimezone(record.Due_Date.toDate(), "Australia/Melbourne").toISOString() ?? undefined

            const response = await xero.accountingApi.createInvoices(
                xeroTenantId,
                { invoices: [invoice] },
                summarizeErrors,
                unitdp,
            )
            await updateRecord([collectionSchema.labels.collection], record.id, {
                Xero_ID: response.body.invoices?.[0].invoiceID,
            })
        }

        const prepareInvoice = async (company: StokerRecord) => {
            let regionName = null
            if (region) {
                regionName = region
            }
            if (record.Copy) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const lineItems: Record<string, any>[] = record.Billing_Line_Items?.map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (lineItem: Record<string, any>) => {
                        delete lineItem.xeroId
                        lineItem.region = regionName
                        return lineItem
                    },
                )
                await addInvoice(lineItems, company)
            } else {
                await addInvoice(null, company)
            }
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
            const contact = populateContact(company)
            try {
                const response = await xero.accountingApi.createContacts(
                    xeroTenantId,
                    { contacts: [contact] },
                    summarizeErrors,
                )
                await updateRecord([contactsCollection.labels.collection], contactId, {
                    Xero_ID: response.body.contacts?.[0].contactID,
                })
                company.Xero_ID = response.body.contacts?.[0].contactID
                await prepareInvoice(company)
            } catch (error) {
                errorLogger(error)
                throw xeroError(error)
            }
        } else {
            try {
                await prepareInvoice(company)
            } catch (error) {
                errorLogger(error)
                throw xeroError(error)
            }
        }
        return
    })()
}

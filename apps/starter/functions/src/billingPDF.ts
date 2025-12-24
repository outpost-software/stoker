import {
    initializeStoker,
    getOne,
    sendMail,
} from "@stoker-platform/node-client";
import {CollectionsSchema} from "@stoker-platform/types";
import {Timestamp} from "firebase-admin/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    CallableRequest,
    HttpsError,
} from "firebase-functions/v2/https";
import {join} from "path";
import {DateTime} from "luxon";
import {getAuth} from "firebase-admin/auth";

/* eslint-disable max-len */

const billingForm = "rygjkaTSW";
const clientCollection = "Companies";
const clientField = "Company";
const toCollection = "Contacts";
const companyName = "Stoker";
const companyEmail = "outpostmailer@gmail.com";
const logoUrl = "data:image/png;base64,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";
const logoWidth = "100px";
const dateFormat = "DD/MM/YYYY";
const billingAddress = `Mastercare Australasia Pty Ltd
ABN: 99 091 788 233
PO Box 340
Unit 3, 15-17 Chaplin Drive
Lane Cove NSW 2066
mastercare@mastercare.com.au
Ph: 02 9429 6200
Fax: 02 9429 6299`;
const paymentInfo = "Bank Account: 1234567890\nBSB: 123456\nAccount Number: 1234567890";
const currency = "$";
const tax = true;
const prefixes = {
    quotes: null,
    invoices: null,
};

const escapeHtml = (text: string): string => {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
};

export const billingPDF = async (
    request: CallableRequest,
    schema: CollectionsSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jsReportKey: any,
) => {
    const user = request.auth?.uid;
    const token = request.auth?.token;
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        throw new HttpsError(
            "permission-denied",
            "User does not have permission to access this database",
        );
    }
    const tenantId = token?.tenant as string;

    const collection = request.data.collection as string;
    const recordId = request.data.recordId as string;

    const sendEmail = request.data.sendEmail as boolean | undefined;
    const message = request.data.message as string | undefined;
    const to = request.data.to as string | string[] | undefined;
    const cc = request.data.cc as string | string[] | undefined;
    const ccSender = request.data.ccSender as boolean | undefined;

    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection];

    if (!user) {
        throw new HttpsError("unauthenticated", "User is not authenticated");
    }
    if (typeof collection !== "string") {
        throw new HttpsError("invalid-argument", "Invalid collection format");
    }
    if (!collectionSchema) {
        throw new HttpsError("invalid-argument", "Collection not found");
    }
    if (typeof recordId !== "string") {
        throw new HttpsError("invalid-argument", "Invalid record ID format");
    }

    const {getTimezone} = await initializeStoker(
        "production",
        tenantId,
        join(process.cwd(), "lib", "system-custom", "main.js"),
        join(process.cwd(), "lib", "system-custom", "collections"),
        true,
    );

    const doc = await getOne(
        [collection],
        recordId,
        {
            user,
        },
    ).catch((error) => {
        errorLogger(error);
        throw new HttpsError("internal", "Error reading data");
    });

    // eslint-disable-next-line security/detect-object-injection
    const company = await getOne([clientCollection], doc[`${clientField}_Array`]?.[0], {
        user,
    }).catch((error) => {
        errorLogger(error);
        throw new HttpsError("internal", "Error reading data");
    });

    const totalsBySection = () => {
        const result = Object.create(null) as Record<string, { subtotal: number; gst: number; total: number }>;
        if (!doc.Billing_Sections) return result;
        /* eslint-disable security/detect-object-injection */
        for (const section of doc.Billing_Sections) {
            const orderKey = Number.isFinite(section.order) ? Math.floor(section.order) : 0;
            if (!Object.prototype.hasOwnProperty.call(result, orderKey)) {
                result[orderKey + "-"] = {subtotal: 0, gst: 0, total: 0};
            }
        }
        if (!doc.Billing_Line_Items) return result;
        for (const item of doc.Billing_Line_Items) {
            const rawKey = item.section as unknown;
            const newKey = Number.isFinite(rawKey as number) ? Math.floor(rawKey as number) : 0;
            if (newKey < 0) continue;
            const key = newKey + "-";
            if (!Object.prototype.hasOwnProperty.call(result, key)) {
                result[key] = {subtotal: 0, gst: 0, total: 0};
            }
            const price = Number.isFinite(item.price) ? item.price : 0;
            const newSubtotal = result[key].subtotal + price;
            if (!Number.isFinite(newSubtotal)) {
                throw new Error("Numeric overflow detected in billing calculation");
            }
            result[key].subtotal = newSubtotal;
            if (item.gst) {
                const newGst = result[key].gst + price * 0.1;
                if (!Number.isFinite(newGst)) {
                    throw new Error("Numeric overflow detected in billing calculation");
                }
                result[key].gst = newGst;
            }
            const newTotal = result[key].subtotal + result[key].gst;
            if (!Number.isFinite(newTotal)) {
                throw new Error("Numeric overflow detected in billing calculation");
            }
            result[key].total = newTotal;
            /* eslint-enable security/detect-object-injection */
        }
        return result;
    };

    const sectionTotals = totalsBySection();
    const newSubtotal = Object.values(sectionTotals).reduce((acc, totals) => {
        const newAcc = acc + totals.subtotal;
        if (!Number.isFinite(newAcc)) {
            throw new Error("Numeric overflow detected in billing calculation");
        }
        return newAcc;
    }, 0);
    const subtotal = newSubtotal.toFixed(2);
    const newGst = Object.values(sectionTotals).reduce((acc, totals) => {
        const newAcc = acc + totals.gst;
        if (!Number.isFinite(newAcc)) {
            throw new Error("Numeric overflow detected in billing calculation");
        }
        return newAcc;
    }, 0);
    const gst = newGst.toFixed(2);
    const newTotal = newSubtotal + newGst;
    if (!Number.isFinite(newTotal)) {
        throw new Error("Numeric overflow detected in billing calculation");
    }
    const total = (Number(subtotal) + Number(gst)).toFixed(2);

    const issuedDate = (doc.Issued_Date as Timestamp).toDate();
    const dueDate = (doc.Due_Date as Timestamp).toDate();
    const issued = new Date(issuedDate.getTime() + DateTime.now().setZone(getTimezone()).offset * 60000).toISOString();
    const due = new Date(dueDate.getTime() + DateTime.now().setZone(getTimezone()).offset * 60000).toISOString();

    type Section = { order: number; title: string; notes: string; showTitle: boolean; showTotals: boolean }
    type LineItem = { section: number; title: string; price: number; gst: boolean }

    const body = {
        logoUrl,
        settings: {
            logoWidth,
            currency,
            tax,
            prefixes,
            dateFormat,
            billingAddress,
            paymentInfo,
        },

        module: {
            name: collectionSchema.labels.collection.toLowerCase(),
            naming: {
                itemCap: collectionSchema.labels.record,
            },
            billing: {
                items: null,
                showSKU: null,
                noQuantity: null,
            },
        },

        item: {
            heading: doc.Billing_Heading,
            att: doc.Billing_Att,
            billing: doc.Billing_Address,
            siteAddress: doc.Billing_Site,
            number: doc.Number,
            issued,
            due,
            notes: doc.Billing_Footnotes,
            showTotals: doc.Billing_Show_Totals,
            value: subtotal,
            gst,
            total,
            status: doc.Status === "Paid" ? "4" : null,

            displayItemTotal: null,
        },

        company: company.Name,
        supplier: null,

        showSections: true,
        sections: doc.Billing_Sections?.map((section: Section) => ({
            id: section.order,
            created: "",
            archived: false,
            name: section.title,
            notes: section.notes,
            showName: section.showTitle,
            showTotal: section.showTotals,
            lines: (doc.Billing_Line_Items?.filter((item: LineItem) => item.section === section.order) || []).map((item: LineItem) => ({
                show: true,
                archived: false,
                notes: item.title,
                price: item.price,
                gst: item.gst,
            })),
        })) || [],
        sectionTotals: Object.fromEntries(Object.entries(sectionTotals).map(([key, value]) => [key, {
            subtotal: value.subtotal.toFixed(2),
            gst: value.gst.toFixed(2),
            total: value.total.toFixed(2),
        }])),

        showItems: false,
        hasItems: false,
        itemsList: null,
        itemTotals: null,

        fieldModules: null,
        customFields: null,
    };

    const response = await fetch("https://outpost.jsreportonline.net/api/report", {
        method: "POST",
        redirect: "error",
        body: JSON.stringify({
            template: {shortid: billingForm},
            data: JSON.stringify(body),
        }),
        headers: {
            "Content-Type": "application/json",
            "Authorization": jsReportKey.value(),
        },
    });
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const filename = `${companyName} ${collectionSchema.labels.record} ${doc.Number}.pdf`;

    if (sendEmail && to && message) {
        const auth = getAuth();
        const userRecord = await auth.getUser(user);

        const toEmails: string[] = [];
        for (const contactId of Object.keys(to)) {
            const contact = await getOne([toCollection], contactId, {
                user,
            }).catch((error) => {
                errorLogger(error);
                throw new HttpsError("internal", "Error reading data");
            });
            if (contact.Email) {
                toEmails.push(contact.Email);
            }
        }

        const ccEmails: string[] = [];
        if (cc) {
            for (const contactId of Object.keys(cc)) {
                const contact = await getOne([toCollection], contactId, {
                    user,
                }).catch((error) => {
                    errorLogger(error);
                    throw new HttpsError("internal", "Error reading data");
                });
                if (contact.Email) {
                    ccEmails.push(contact.Email);
                }
            }
            if (ccSender && request.auth?.token?.email) {
                ccEmails.push(request.auth.token.email);
            }
        }
        await sendMail(
            toEmails,
            `${collectionSchema.labels.record} #${doc.Number} from ${companyName}`,
            undefined,
            "<div style='white-space: pre'>" + escapeHtml(message || "") + "</div><br><br><br>",
            ccEmails,
            undefined,
            `${userRecord.displayName} <${userRecord.email}>`,
            [{filename, content: Buffer.from(arrayBuffer), contentType: "application/pdf"}],
            `${companyName} <${companyEmail}>`,
        ).catch((error) => {
            errorLogger(error);
            throw new HttpsError("internal", "Error sending email");
        });
    } else {
        return {
            file: base64,
            filename,
        };
    }
    return;
};

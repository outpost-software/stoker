import { getFirestore } from "firebase-admin/firestore"
import { getMode } from "../initializeStoker"
import {
    sanitizeEmailAddress,
    sanitizeEmailAddressOrArray,
    sanitizeEmailSubject,
    sanitizeEmailBody,
} from "@stoker-platform/utils"

export const sendMail = async (
    to: string | string[],
    subject: string,
    text?: string,
    html?: string,
    cc?: string | string[],
    bcc?: string | string[],
    replyTo?: string,
    attachments?: {
        filename: string
        content: Buffer
        contentType: string
    }[],
    from?: string,
) => {
    const db = getFirestore()
    const mode = getMode()
    const adminEmail = process.env.ADMIN_EMAIL
    if (mode === "development" || process.env.FIRESTORE_EMULATOR_HOST) {
        if (adminEmail) {
            to = adminEmail
        } else {
            throw new Error("Admin email not set")
        }
    }

    const sanitizedTo = sanitizeEmailAddressOrArray(to)
    const sanitizedSubject = sanitizeEmailSubject(subject)
    const sanitizedText = text ? sanitizeEmailBody(text) : undefined
    const sanitizedHtml = html ? sanitizeEmailBody(html) : undefined
    const sanitizedCc = cc ? sanitizeEmailAddressOrArray(cc) : undefined
    const sanitizedBcc = bcc ? sanitizeEmailAddressOrArray(bcc) : undefined
    const sanitizedReplyTo = replyTo ? sanitizeEmailAddress(replyTo) : undefined
    const sanitizedFrom = from ? sanitizeEmailAddress(from) : undefined

    const toArray = Array.isArray(sanitizedTo) ? sanitizedTo : [sanitizedTo]
    if (toArray.length === 0 || (toArray.length === 1 && !toArray[0])) {
        throw new Error("No valid email addresses provided")
    }

    const mail: {
        to: string | string[]
        cc?: string | string[]
        bcc?: string | string[]
        replyTo?: string
        from?: string
        message: {
            subject: string
            text?: string
            html?: string
            attachments?: {
                filename: string
                content: Buffer
                contentType: string
            }[]
        }
    } = { to: sanitizedTo, message: { subject: sanitizedSubject } }
    if (sanitizedText) {
        mail.message.text = sanitizedText
    }
    if (sanitizedHtml) {
        mail.message.html = sanitizedHtml
    }
    if (sanitizedCc) {
        const ccArray = Array.isArray(sanitizedCc) ? sanitizedCc : [sanitizedCc]
        if (ccArray.length > 0 && ccArray[0]) {
            mail.cc = sanitizedCc
        }
    }
    if (sanitizedBcc) {
        const bccArray = Array.isArray(sanitizedBcc) ? sanitizedBcc : [sanitizedBcc]
        if (bccArray.length > 0 && bccArray[0]) {
            mail.bcc = sanitizedBcc
        }
    }
    if (sanitizedReplyTo) {
        mail.replyTo = sanitizedReplyTo
    }
    if (attachments) {
        mail.message.attachments = attachments
    }
    if (sanitizedFrom) {
        mail.from = sanitizedFrom
    }
    await db.collection("system_mail").add(mail)
    return
}

import type { CollectionSchema, DialogContent, GenerateSchema } from "@stoker-platform/types"
import { Download, FileText, Mail, Wallet } from "lucide-react"
import { Billing } from "../web/Billing.js"
import { Title } from "../web/Title.js"
import { Preview } from "../web/Preview.js"

const Invoices: GenerateSchema = (_sdk, _utils, context): CollectionSchema => {
    const { setDialogContent } = (context || {}) as {
        setDialogContent: (dialogContent: DialogContent | null) => void
    }
    return {
        labels: {
            collection: "Invoices",
            record: "Invoice",
        },
        enableWriteLog: true,
        fullTextSearch: ["Ref"],
        access: {
            operations: {
                assignable: true,
            },
        },
        recordTitleField: "Ref",
        softDelete: {
            archivedField: "Archived",
            timestampField: "Archived_At",
            retentionPeriod: 7,
        },
        preloadCache: {
            roles: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
            relationCollections: true,
            range: {
                fields: ["Created_At", "Issued_Date"],
                labels: ["Created Date", "Issued Date"],
                start: "Today",
                end: 30,
                selector: ["week", "month", "range"],
            },
        },
        indexExemption: true,
        custom: {
            autoCorrectUnique: true,
        },
        admin: {
            navbarPosition: 5,
            restrictExport: ["Office"],
            breadcrumbs: ["Company", "Site"],
            live: true,
            statusField: {
                field: "Status",
                active: ["Draft", "Sent"],
                archived: ["Paid", "Archived"],
            },
            filters: [
                {
                    type: "select",
                    field: "Status",
                    style: "radio",
                },
            ],
            customRecordPages: [
                {
                    title: "Line Items",
                    url: "billing",
                    component: Billing,
                    icon: Wallet as React.FC,
                },
                {
                    title: "Preview",
                    url: "preview",
                    component: Preview,
                    icon: FileText as React.FC,
                },
            ],
            customFields: [
                {
                    position: 8,
                    component: Title as React.FC,
                    props: {
                        title: "Email Invoice",
                    },
                    condition(operation) {
                        return operation === "update"
                    },
                },
            ],
            formButtons: [
                {
                    title: "Download PDF",
                    icon: Download as React.FC,
                    async action(_operation, _formValues, record) {
                        if (!this.setIsLoading || !record) return
                        this.setIsLoading(true)
                        const { getEnv } = await import("@stoker-platform/web-client")
                        const { getApp } = await import("firebase/app")
                        const { getFunctions, httpsCallable } = await import("firebase/functions")
                        const app = getApp()
                        const env = getEnv()
                        const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
                        const billingPDFApi = httpsCallable(firebaseFunctions, "stoker-billingpdf")
                        const addRecordResult = await billingPDFApi({
                            collection: "Invoices",
                            recordId: record?.id,
                        })
                        const { file, filename } = (addRecordResult.data || {}) as { file?: string; filename?: string }

                        if (file && filename) {
                            const { sanitizeDownloadFilename } = await import("@stoker-platform/utils")
                            const binaryString = atob(file)
                            const length = binaryString.length
                            const bytes = new Uint8Array(length)
                            // eslint-disable-next-line security/detect-object-injection
                            for (let i = 0; i < length; i++) bytes[i] = binaryString.charCodeAt(i)
                            const blob = new Blob([bytes], { type: "application/pdf" })
                            const url = URL.createObjectURL(blob)
                            try {
                                const a = document.createElement("a")
                                a.href = url
                                a.download = sanitizeDownloadFilename(filename)
                                a.rel = "noopener noreferrer"
                                a.referrerPolicy = "no-referrer"
                                document.body.appendChild(a)
                                a.click()
                                a.remove()
                            } finally {
                                URL.revokeObjectURL(url)
                                this.setIsLoading(false)
                            }
                        } else {
                            this.setIsLoading(false)
                        }
                    },
                    condition(operation) {
                        return operation === "update"
                    },
                },
                {
                    title: "Email PDF",
                    icon: Mail as React.FC,
                    async action(_operation, record) {
                        if (!this.setIsLoading || !record) return
                        const setIsLoading = this.setIsLoading
                        setDialogContent({
                            title: "Definitely send email now?",
                            description: "The invoice will be sent to the client(s) now.",
                            buttons: [
                                {
                                    label: "Send",
                                    onClick: async () => {
                                        setDialogContent(null)
                                        setIsLoading(true)
                                        const { getEnv } = await import("@stoker-platform/web-client")
                                        const { getApp } = await import("firebase/app")
                                        const { getFunctions, httpsCallable } = await import("firebase/functions")
                                        const app = getApp()
                                        const env = getEnv()
                                        const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)
                                        const billingPDFApi = httpsCallable(firebaseFunctions, "stoker-billingpdf")
                                        await billingPDFApi({
                                            collection: "Invoices",
                                            recordId: record?.id,
                                            clientField: "Company",
                                            sendEmail: true,
                                            message: record.Message,
                                            to: record.To,
                                            cc: record.CC,
                                            ccSender: true,
                                        })
                                            .then(() => {
                                                setDialogContent({
                                                    title: "Email sent successfully",
                                                    description: "The invoice has been sent to the client(s).",
                                                })
                                                setIsLoading(false)
                                            })
                                            .catch(() => {
                                                setDialogContent({
                                                    title: "Error sending email",
                                                    description: "Please try again.",
                                                })
                                                setIsLoading(false)
                                            })
                                            .catch(() => {
                                                setDialogContent({
                                                    title: "Error sending email",
                                                    description: "Please try again.",
                                                })
                                                setIsLoading(false)
                                            })
                                    },
                                },
                            ],
                        })
                    },
                    condition(operation) {
                        return operation === "update"
                    },
                },
            ],
        },
        fields: [
            {
                name: "Number",
                type: "Number",
                autoIncrement: true,
                required: true,
            },
            {
                name: "Ref",
                type: "String",
                required: true,
            },
            {
                name: "Archived",
                type: "Boolean",
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                },
            },
            {
                name: "Archived_At",
                type: "Timestamp",
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                },
            },
            {
                name: "Company",
                type: "OneToMany",
                collection: "Companies",
                includeFields: ["Name"],
                dependencyFields: [{ field: "Name", roles: ["Office"] }],
                titleField: "Name",
                required: true,
            },
            {
                name: "Site",
                type: "OneToMany",
                collection: "Sites",
                includeFields: ["Name"],
                dependencyFields: [{ field: "Name", roles: ["Office"] }],
                titleField: "Name",
                required: true,
            },
            {
                name: "Status",
                type: "String",
                values: ["Draft", "Sent", "Paid", "Archived"],
                required: true,
                restrictUpdate: ["Office"],
            },
            {
                name: "Issued_Date",
                type: "Timestamp",
                required: true,
            },
            {
                name: "Due_Date",
                type: "Timestamp",
                required: true,
            },
            {
                name: "Message",
                type: "String",
                admin: {
                    textarea: true,
                    condition: {
                        form(operation) {
                            return operation === "update"
                        },
                        list: false,
                    },
                },
            },
            {
                name: "To",
                type: "ManyToMany",
                collection: "Contacts",
                includeFields: ["Name"],
                titleField: "Name",
                dependencyFields: [{ field: "Name", roles: ["Office", "Area Manager"] }],
                admin: {
                    condition: {
                        form(operation) {
                            return operation === "update"
                        },
                        list: false,
                    },
                },
            },
            {
                name: "CC",
                type: "ManyToMany",
                collection: "Contacts",
                includeFields: ["Name"],
                titleField: "Name",
                dependencyFields: [{ field: "Name", roles: ["Office", "Area Manager"] }],
                admin: {
                    condition: {
                        form(operation) {
                            return operation === "update"
                        },
                        list: false,
                    },
                },
            },
            {
                name: "Billing_Heading",
                type: "String",
                admin: {
                    condition: {
                        form: false,
                        list: false,
                    },
                },
            },
            {
                name: "Billing_Att",
                type: "String",
                admin: {
                    condition: {
                        form: false,
                        list: false,
                    },
                },
            },
            {
                name: "Billing_Address",
                type: "String",
                admin: {
                    textarea: true,
                    condition: {
                        form: false,
                        list: false,
                    },
                },
            },
            {
                name: "Billing_Site",
                type: "String",
                admin: {
                    textarea: true,
                    condition: {
                        form: false,
                        list: false,
                    },
                },
            },
            {
                name: "Billing_Sections",
                type: "Array",
                admin: {
                    condition: {
                        form: false,
                        list: false,
                    },
                },
            },
            {
                name: "Billing_Line_Items",
                type: "Array",
                admin: {
                    condition: {
                        form: false,
                        list: false,
                    },
                },
            },
            {
                name: "Billing_Show_Totals",
                type: "Boolean",
                admin: {
                    condition: {
                        form: false,
                        list: false,
                    },
                },
            },
            {
                name: "Billing_Footnotes",
                type: "String",
                admin: {
                    textarea: true,
                    condition: {
                        form: false,
                        list: false,
                    },
                },
            },
        ],
    }
}

export default Invoices

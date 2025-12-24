import type { CollectionSchema, GenerateSchema, StokerRecord, WebUtilities } from "@stoker-platform/types"
import {
    Forward,
    Inbox as InboxIcon,
    MessageCircle,
    ReplyAllIcon,
    ReplyIcon,
    SquarePen,
    Timer,
    TrendingUp,
    User,
    Users,
} from "lucide-react"
import { blueField, greenField, redField } from "../utils.js"
import { parseDate } from "@stoker-platform/utils"

const toasted: string[] = []

const Inbox: GenerateSchema = (sdk, utils, context): CollectionSchema => {
    const { toast } = (context || {}) as {
        toast: ({
            title,
            description,
            variant,
            duration,
        }: {
            title: string
            description: string
            variant?: "default" | "destructive" | null | undefined
            duration?: number
        }) => void
    }
    return {
        labels: {
            collection: "Inbox",
            record: "Inbox_Message",
        },
        access: {
            operations: {
                read: ["Admin", "User"],
                create: ["Admin", "User"],
                update: ["Admin", "User"],
            },
            attributeRestrictions: [
                {
                    type: "Record_User",
                    collectionField: "Recipient",
                    roles: [{ role: "Admin" }, { role: "User" }],
                    operations: ["Read", "Update"],
                },
            ],
        },
        indexExemption: true,
        preloadCache: {
            roles: ["Admin", "User"],
            range: {
                fields: ["Saved_At"],
                labels: ["Received"],
                start: -30,
                end: 14,
                selector: ["week", "month", "range"],
            },
        },
        recordTitleField: "Subject",
        fullTextSearch: ["Subject", "Message"],
        softDelete: {
            archivedField: "Archived",
            timestampField: "Archived_At",
            retentionPeriod: 7,
        },
        custom: {
            async postRead(_context, _refs, record?: StokerRecord) {
                if (sdk === "web") {
                    if (record && record.Status === "Unread" && !record.Notified && !toasted.includes(record.id)) {
                        toasted.push(record.id)
                        const { updateRecord } = await import("@stoker-platform/web-client")
                        toast({ title: "New Message", description: record.Subject, duration: 10000000 })
                        updateRecord(["Inbox"], record.id, {
                            Notified: true,
                        })
                    }
                }
            },
        },
        admin: {
            navbarPosition: 1,
            titles: {
                collection: "Inbox",
                record: "Message",
            },
            icon: InboxIcon as React.FC,
            itemsPerPage: 20,
            defaultRangeSelector: "range",
            defaultSort: {
                field: "Received",
                direction: "desc",
            },
            statusField: {
                field: "Status",
                active: ["Unread", "Read"],
                archived: ["Archived"],
            },
            cards: {
                headerField: "Saved_At",
                sections: [
                    {
                        title: "People",
                        fields: ["Sender", "Recipients"],
                        maxSectionLines: 3,
                    },
                ],
            },
            metrics: [
                {
                    type: "count",
                    title: "Total Messages",
                },
                {
                    type: "area",
                    dateField: "Saved_At",
                    defaultRange: "30d",
                    title: "Messages Over Time",
                },
            ],
            filters: [
                {
                    type: "select",
                    field: "Status",
                },
                {
                    type: "relation",
                    field: "Sender",
                },
                {
                    type: "relation",
                    field: "Recipients",
                },
            ],
            rowHighlight: [
                {
                    condition(record) {
                        return record.Status === "Unread"
                    },
                    className: "bg-blue-500/30 dark:bg-blue-500/50 hover:bg-blue-500/50 dark:hover:bg-blue-500",
                },
            ],
            addRecordButtonOverride(record?: StokerRecord) {
                const { getSchema } = utils as WebUtilities
                const schema = getSchema()
                const { createRecordForm } = context
                createRecordForm(schema.collections.Outbox, ["Outbox"], record)
            },
            async onFormOpen(operation, record) {
                if (operation === "update" && record?.Status === "Unread") {
                    const { updateRecord } = await import("@stoker-platform/web-client")
                    await updateRecord(["Inbox"], record.id, {
                        Status: "Read",
                    })
                }
            },
            formButtons: [
                {
                    title: "Reply",
                    icon: ReplyIcon as React.FC,
                    async action(_operation, _formValues, originalRecord) {
                        if (!originalRecord) return
                        const { getSchema } = utils as WebUtilities
                        const schema = getSchema()
                        const { getCurrentUser } = await import("@stoker-platform/web-client")
                        const user = getCurrentUser()
                        const { claims } = user.token
                        const originalMessage = originalRecord.Message as unknown as
                            | { ops?: Array<Record<string, unknown>> }
                            | string
                            | undefined
                        const originalOps =
                            typeof originalMessage === "object" && originalMessage && Array.isArray(originalMessage.ops)
                                ? originalMessage.ops
                                : [
                                      {
                                          insert: `${typeof originalMessage === "string" ? originalMessage : ""}`,
                                      },
                                  ]
                        const replyMessage = {
                            ops: [
                                {
                                    insert: "\n\n\n--------------------------------\n\n\n",
                                },
                                ...originalOps,
                            ],
                        }
                        const replyRecord = {
                            Subject: `Re: ${originalRecord.Subject}`,
                            Message: replyMessage,
                            Sender: {
                                [claims.doc as string]: {
                                    Collection_Path: ["Users"],
                                    Name: user.displayName,
                                },
                            },
                            Recipients: originalRecord.Sender,
                        }
                        const { createRecordForm } = context
                        createRecordForm(schema.collections.Outbox, ["Outbox"], replyRecord)
                    },
                    condition(operation) {
                        return operation === "update"
                    },
                },
                {
                    title: "Reply All",
                    icon: ReplyAllIcon as React.FC,
                    async action(_operation, _formValues, originalRecord) {
                        if (!originalRecord) return
                        const { getSchema } = utils as WebUtilities
                        const schema = getSchema()
                        const { getCurrentUser } = await import("@stoker-platform/web-client")
                        const user = getCurrentUser()
                        const { claims } = user.token
                        const originalMessage = originalRecord.Message as unknown as
                            | { ops?: Array<Record<string, unknown>> }
                            | string
                            | undefined
                        const originalOps =
                            typeof originalMessage === "object" && originalMessage && Array.isArray(originalMessage.ops)
                                ? originalMessage.ops
                                : [
                                      {
                                          insert: `${typeof originalMessage === "string" ? originalMessage : ""}`,
                                      },
                                  ]
                        const replyMessage = {
                            ops: [
                                {
                                    insert: "\n\n\n--------------------------------\n\n\n",
                                },
                                ...originalOps,
                            ],
                        }
                        const recipients = Object.entries(originalRecord.Recipients).filter(([key, value]) => {
                            return key !== Object.keys(originalRecord.Recipient)[0] ? value : undefined
                        })
                        const replyRecord = {
                            Subject: `Re: ${originalRecord.Subject}`,
                            Message: replyMessage,
                            Sender: {
                                [claims.doc as string]: {
                                    Collection_Path: ["Users"],
                                    Name: user.displayName,
                                },
                            },
                            Recipients: { ...Object.fromEntries(recipients), ...originalRecord.Sender },
                        }
                        const { createRecordForm } = context
                        createRecordForm(schema.collections.Outbox, ["Outbox"], replyRecord)
                    },
                    condition(operation) {
                        return operation === "update"
                    },
                },
            ],
        },
        fields: [
            {
                name: "Received",
                type: "Computed",
                async formula(record?: StokerRecord) {
                    if (!record) return ""
                    if (sdk === "web") {
                        const { displayDate } = await import("@stoker-platform/web-client")
                        return displayDate(record.Saved_At)
                    } else {
                        const { displayDate } = await import("@stoker-platform/node-client")
                        return displayDate(record.Saved_At)
                    }
                },
                admin: {
                    condition: {
                        form(operation) {
                            return operation === "update"
                        },
                    },
                    icon: {
                        component: Timer as React.FC,
                        className: blueField,
                    },
                    hidden: "md",
                    sort(record?: StokerRecord) {
                        return parseDate(record?.Received)
                    },
                },
            },
            {
                name: "Sender",
                type: "OneToMany",
                required: true,
                collection: "Users",
                includeFields: ["Name"],
                titleField: "Name",
                admin: {
                    icon: {
                        component: Forward as React.FC,
                        className: redField,
                    },
                },
                restrictUpdate: true,
            },
            {
                name: "Recipient",
                type: "OneToMany",
                collection: "Users",
                required: true,
                includeFields: ["Name"],
                titleField: "Name",
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                    icon: {
                        component: User as React.FC,
                        className: redField,
                    },
                },
                restrictUpdate: true,
            },
            {
                name: "Recipients",
                type: "ManyToMany",
                collection: "Users",
                required: true,
                includeFields: ["Name"],
                titleField: "Name",
                admin: {
                    icon: {
                        component: Users as React.FC,
                        className: redField,
                    },
                    hidden: "md",
                },
                restrictUpdate: true,
            },
            {
                name: "Subject",
                type: "String",
                required: true,
                admin: {
                    icon: {
                        component: MessageCircle as React.FC,
                        className: greenField,
                    },
                },
                restrictUpdate: true,
            },
            {
                name: "Status",
                type: "String",
                values: ["Unread", "Read", "Archived"],
                required: true,
                admin: {
                    live: true,
                    badge(record?: StokerRecord) {
                        if (!record) return true
                        switch (record.Status) {
                            case "Unread":
                                return "destructive"
                            case "Read":
                                return "secondary"
                            case "Archived":
                                return "primary"
                            default:
                                return true
                        }
                    },
                    icon: {
                        component: TrendingUp as React.FC,
                        className: greenField,
                    },
                    hidden: "lg",
                },
            },
            {
                name: "Message",
                type: "Map",
                required: true,
                admin: {
                    richText: true,
                    condition: {
                        list: false,
                    },
                    icon: {
                        component: SquarePen as React.FC,
                        className: greenField,
                    },
                },
                restrictUpdate: true,
            },

            {
                name: "Outbox_Message",
                type: "String",
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                },
                restrictUpdate: true,
            },
            {
                name: "Notified",
                type: "Boolean",
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                },
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
        ],
    }
}

export default Inbox

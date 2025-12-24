import type { CollectionSchema, GenerateSchema, StokerRecord, WebUtilities } from "@stoker-platform/types"
import { parseDate } from "@stoker-platform/utils"
import { Inbox as InboxIcon, ReplyAllIcon, ReplyIcon } from "lucide-react"

const Inbox: GenerateSchema = (sdk, utils, context): CollectionSchema => {
    return {
        labels: {
            collection: "Inbox",
            record: "Inbox_Message",
        },
        fullTextSearch: ["Subject", "Message"],
        access: {
            operations: {
                read: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
                create: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
                update: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
            },
            attributeRestrictions: [
                {
                    type: "Record_User",
                    collectionField: "Recipient",
                    roles: [
                        { role: "Office" },
                        { role: "Area Manager" },
                        { role: "Subcontractor" },
                        { role: "Cleaner" },
                        { role: "Client" },
                    ],
                    operations: ["Read", "Update"],
                },
            ],
        },
        recordTitleField: "Subject",
        softDelete: {
            archivedField: "Archived",
            timestampField: "Archived_At",
            retentionPeriod: 7,
        },
        preloadCache: {
            roles: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
            range: {
                fields: ["Saved_At"],
                labels: ["Received"],
                start: "Today",
                startOffsetDays: -30,
                end: 1,
                selector: ["week", "month", "range"],
            },
        },
        indexExemption: true,
        admin: {
            navbarPosition: 6,
            titles: {
                collection: "Inbox",
                record: "Message",
            },
            icon: InboxIcon as React.FC,
            itemsPerPage: 20,
            defaultSort: {
                field: "Received",
                direction: "desc",
            },
            restrictExport: ["Office"],
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
                        maxSectionLines: 2,
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
                    defaultRange: "90d",
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
                    action: async (_operation, _formValues, record) => {
                        if (!record) return
                        const { getSchema } = utils as WebUtilities
                        const schema = getSchema()
                        const { getCurrentUser } = await import("@stoker-platform/web-client")
                        const user = getCurrentUser()
                        const { claims } = user.token
                        const originalMessage = record.Message as unknown as
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
                            Subject: `Re: ${record.Subject}`,
                            Message: replyMessage,
                            Sender: {
                                [claims.doc as string]: {
                                    Collection_Path: ["Users"],
                                    Name: user.displayName,
                                },
                            },
                            Recipients: record.Sender,
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
                    action: async (_operation, record) => {
                        if (!record) return
                        const { getSchema } = utils as WebUtilities
                        const schema = getSchema()
                        const { getCurrentUser } = await import("@stoker-platform/web-client")
                        const user = getCurrentUser()
                        const { claims } = user.token
                        const originalMessage = record.Message as unknown as
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
                        const recipients = Object.entries(record.Recipients).filter(([key, value]) => {
                            return key !== Object.keys(record.Recipient)[0] ? value : undefined
                        })
                        const replyRecord = {
                            Subject: `Re: ${record.Subject}`,
                            Message: replyMessage,
                            Sender: {
                                [claims.doc as string]: {
                                    Collection_Path: ["Users"],
                                    Name: user.displayName,
                                },
                            },
                            Recipients: { ...Object.fromEntries(recipients), ...record.Sender },
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
                    return ""
                },
                admin: {
                    hidden: "md",
                    sort: (record?: StokerRecord) => {
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
                restrictUpdate: true,
            },
            {
                name: "Recipient",
                type: "OneToMany",
                collection: "Users",
                required: true,
                includeFields: ["Name"],
                titleField: "Name",
                restrictUpdate: true,
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                },
            },
            {
                name: "Recipients",
                type: "ManyToMany",
                collection: "Users",
                required: true,
                includeFields: ["Name"],
                titleField: "Name",
                restrictUpdate: true,
                admin: {
                    hidden: "md",
                },
            },
            {
                name: "Subject",
                type: "String",
                required: true,
                restrictUpdate: true,
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
                    hidden: "lg",
                },
            },
            {
                name: "Message",
                type: "Map",
                required: true,
                restrictUpdate: true,
                admin: {
                    richText: true,
                    condition: {
                        list: false,
                    },
                },
            },
            {
                name: "Work_Order",
                type: "OneToMany",
                collection: "Work_Orders",
                admin: {
                    condition: {
                        list: false,
                    },
                },
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
        ],
    }
}

export default Inbox

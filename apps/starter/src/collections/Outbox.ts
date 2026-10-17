import type { CollectionSchema, GenerateSchema, StokerRecord } from "@stoker-platform/types"
import { parseDate } from "@stoker-platform/utils"
import { Send } from "lucide-react"

const Outbox: GenerateSchema = ({ sdk }): CollectionSchema => {
    return {
        labels: {
            collection: "Outbox",
            record: "Outbox_Message",
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
                    type: "Record_Owner",
                    roles: [
                        { role: "Office" },
                        { role: "Area Manager" },
                        { role: "Subcontractor" },
                        { role: "Cleaner" },
                        { role: "Client" },
                    ],
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
                labels: ["Sent"],
                start: "Today",
                startOffsetDays: -30,
                end: 1,
                selector: ["week", "month", "range"],
            },
        },
        indexExemption: true,
        custom: {
            preWrite: async ({ operation, data }) => {
                if (operation === "create") {
                    data.Status = "Sending"
                }
            },
        },
        admin: {
            navbarPosition: 7,
            titles: {
                collection: "Outbox",
                record: "Message",
            },
            icon: Send as React.FC,
            itemsPerPage: 20,
            defaultSort: {
                field: "Sent",
                direction: "desc",
            },
            restrictExport: ["Office"],
            filters: [
                {
                    type: "relation",
                    field: "Recipients",
                },
            ],
        },
        fields: [
            {
                name: "Sent",
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
                        return parseDate(record?.Sent)
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
                dependencyFields: [
                    { field: "Name", roles: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"] },
                ],
                restrictUpdate: true,
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
                values: ["Sending", "Success", "Failed"],
                required: true,
                admin: {
                    badge(record?: StokerRecord) {
                        if (!record) return true
                        switch (record.Status) {
                            case "Sending":
                                return "primary"
                            case "Success":
                                return "secondary"
                            case "Failed":
                                return "destructive"
                            default:
                                return true
                        }
                    },
                    readOnly: true,
                    condition: {
                        form(operation) {
                            return operation !== "create"
                        },
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
        ],
    }
}

export default Outbox

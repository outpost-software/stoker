import type { CollectionSchema, GenerateSchema, StokerRecord, StokerRelationObject } from "@stoker-platform/types"
import { MessageCircle, Send, SquarePen, Timer, TrendingUp, Users } from "lucide-react"
import { blueField, greenField, redField } from "../utils.js"
import { parseDate } from "@stoker-platform/utils"

const Outbox: GenerateSchema = (sdk: "web" | "node"): CollectionSchema => {
    return {
        labels: {
            collection: "Outbox",
            record: "Outbox_Message",
        },
        access: {
            operations: {
                read: ["Admin", "User"],
                create: ["Admin", "User"],
                update: ["Admin", "User"],
            },
            attributeRestrictions: [
                {
                    type: "Record_Owner",
                    roles: [{ role: "Admin" }, { role: "User" }],
                },
            ],
        },
        indexExemption: true,
        preloadCache: {
            roles: ["Admin", "User"],
            range: {
                fields: ["Saved_At"],
                labels: ["Sent"],
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
            async preWrite(operation, data) {
                if (operation === "create") {
                    data.Status = "Sending"
                }
            },
            async postWrite(operation, data) {
                if (operation === "create") {
                    if (sdk === "web") {
                        const { addRecord, updateRecord, getCurrentUser } = await import("@stoker-platform/web-client")
                        const user = getCurrentUser()
                        if (!user) throw new Error("User not found")
                        const { claims } = user.token
                        try {
                            for (const [id, recipient] of Object.entries(data.Recipients as StokerRelationObject)) {
                                await addRecord(["Inbox"], {
                                    Subject: data.Subject,
                                    Message: data.Message,
                                    Recipient: {
                                        [id]: {
                                            Collection_Path: ["Users"],
                                            Name: recipient.Name,
                                        },
                                    },
                                    Recipients: data.Recipients,
                                    Status: "Unread",
                                    Sender: {
                                        [claims.doc as string]: {
                                            Collection_Path: ["Users"],
                                            Name: user?.displayName,
                                        },
                                    },
                                    Outbox_Message: data.id,
                                })
                            }
                        } catch (error) {
                            await updateRecord(["Outbox"], data.id, {
                                Status: "Failed",
                            })
                            console.error(error)
                        }
                    } else {
                        const { addRecord, updateRecord, getUser } = await import("@stoker-platform/node-client")
                        if (data.Created_By === "System") return
                        const user = await getUser(data.Created_By)
                        try {
                            for (const [id, recipient] of Object.entries(data.Recipients as StokerRelationObject)) {
                                await addRecord(["Inbox"], {
                                    Subject: data.Subject,
                                    Message: data.Message,
                                    Recipient: {
                                        [id]: {
                                            Collection_Path: ["Users"],
                                            Name: recipient.Name,
                                        },
                                    },
                                    Recipients: data.Recipients,
                                    Status: "Unread",
                                    Sender: {
                                        [user.customClaims?.doc as string]: {
                                            Collection_Path: ["Users"],
                                            Name: user.displayName,
                                        },
                                    },
                                    Outbox_Message: data.id,
                                })
                            }
                        } catch (error) {
                            await updateRecord(["Outbox"], data.id, {
                                Status: "Failed",
                            })
                            throw error
                        }
                    }
                }
            },
        },
        admin: {
            navbarPosition: 2,
            titles: {
                collection: "Outbox",
                record: "Message",
            },
            icon: Send as React.FC,
            itemsPerPage: 20,
            defaultRangeSelector: "range",
            defaultSort: {
                field: "Sent",
                direction: "desc",
            },
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
                dependencyFields: [{ field: "Name", roles: ["Admin", "User"] }],
                admin: {
                    icon: {
                        component: Users as React.FC,
                        className: blueField,
                    },
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
                        className: redField,
                    },
                },
                restrictUpdate: true,
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
                    icon: {
                        component: TrendingUp as React.FC,
                        className: redField,
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

export default Outbox

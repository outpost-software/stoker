import type { GenerateSchema, CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { Activity, ChevronsUp, Image, Mail, User, Users2 } from "lucide-react"
import { blueField, greenField, redField } from "../utils.js"

const Users: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Users",
            record: "User",
        },
        auth: true,
        access: {
            auth: ["Admin"],
            operations: {
                assignable: ["Admin"],
                read: ["Admin"],
                create: ["Admin"],
                update: ["Admin"],
                delete: ["Admin"],
            },
        },
        indexExemption: true,
        enableWriteLog: true,
        preloadCache: {
            roles: ["Admin", "User"],
        },
        recordTitleField: "Name",
        fullTextSearch: ["Name", "Email"],
        admin: {
            navbarPosition: 3,
            icon: Users2 as React.FC,
            statusField: {
                field: "Enabled",
                active: [true],
                archived: [false],
            },
            itemsPerPage: 20,
            filters: [
                {
                    type: "select",
                    field: "Role",
                    style: "buttons",
                },
            ],
        },
        fields: [
            {
                name: "Name",
                type: "String",
                required: true,
                admin: {
                    icon: {
                        component: User as React.FC,
                        className: blueField,
                    },
                },
            },
            {
                name: "Enabled",
                type: "Boolean",
                required: true,
                admin: {
                    switch: true,
                    hidden: "lg",
                    icon: {
                        component: Activity as React.FC,
                        className: blueField,
                    },
                },
            },
            {
                name: "Role",
                type: "String",
                values: ["Admin", "User"],
                required: true,
                admin: {
                    badge(record?: StokerRecord) {
                        if (!record) return true
                        switch (record.Role) {
                            case "Admin":
                                return "destructive"
                            case "User":
                                return "primary"
                            default:
                                return true
                        }
                    },
                    icon: {
                        component: ChevronsUp as React.FC,
                        className: blueField,
                    },
                },
                sorting: true,
            },
            {
                name: "Email",
                type: "String",
                email: true,
                required: true,
                unique: true,
                admin: {
                    hidden: "sm",
                    icon: {
                        component: Mail as React.FC,
                        className: redField,
                    },
                },
                sorting: true,
            },
            {
                name: "Photo_URL",
                type: "String",
                pattern: "^https://firebasestorage\\.googleapis\\.com/.*$",
                admin: {
                    label: "Photo",
                    image: true,
                    hidden: "xl",
                    icon: {
                        component: Image as React.FC,
                        className: greenField,
                    },
                },
            },
            {
                name: "User_ID",
                type: "String",
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

export default Users

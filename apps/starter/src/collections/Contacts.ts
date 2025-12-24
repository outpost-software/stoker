import type { CollectionSchema, GenerateSchema } from "@stoker-platform/types"
import { SquareUserRound } from "lucide-react"

const Contacts: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Contacts",
            record: "Contact",
        },
        auth: true,
        allowSchemalessFields: true,
        access: {
            serverWriteOnly: true,
            auth: ["Office", "Area Manager", "Subcontractor"],
            operations: {
                assignable: true,
                read: ["Office", "Area Manager"],
                create: ["Office", "Area Manager"],
                update: ["Office", "Area Manager"],
                delete: ["Office"],
            },
        },
        recordTitleField: "Name",
        seedOrder: 3,
        admin: {
            navbarPosition: 2,
            duplicate: true,
            icon: SquareUserRound as React.FC,
            cards: {
                statusField: "Enabled",
                headerField: "Created_At",
                sections: [
                    {
                        title: "User Details",
                        fields: ["Name", "Role", "Email"],
                        maxSectionLines: 1,
                    },
                ],
            },
            filters: [
                {
                    type: "relation",
                    field: "Company",
                    constraints: [["Active", "==", true]],
                },
                {
                    type: "range",
                    field: "Created_At",
                    selector: ["week", "month", "range"],
                    startOffsetHours: 8,
                },
            ],
            onFormOpen: async (operation) => {
                if (operation === "create") {
                    alert("Hook Test")
                }
            },
        },
        indexExemption: true,
        fields: [
            {
                name: "Name",
                type: "String",
                required: true,
                maxlength: 255,
            },
            {
                name: "User_ID",
                type: "String",
                admin: {
                    condition: {
                        list: false,
                    },
                },
            },
            {
                name: "Enabled",
                type: "Boolean",
                required: true,
            },
            {
                name: "Role",
                type: "String",
                values: ["Client"],
                required: true,
            },
            {
                name: "Email",
                type: "String",
                email: true,
                unique: true,
                required: true,
            },
            {
                name: "Company",
                type: "OneToMany",
                required: true,
                collection: "Companies",
                includeFields: ["Name"],
                titleField: "Name",
                dependencyFields: [{ field: "Active", roles: ["Area Manager"] }],
                restrictUpdate: true,
                sorting: true,
            },
            {
                name: "Establishment",
                type: "OneToOne",
                collection: "Companies",
                dependencyFields: [{ field: "Name", roles: ["Area Manager", "Subcontractor"] }],
                includeFields: ["Name"],
            },
            {
                name: "Work_Orders",
                type: "ManyToOne",
                collection: "Work_Orders",
                dependencyFields: [{ field: "Start", roles: ["Area Manager"] }],
                includeFields: ["Name"],
            },
            {
                name: "State",
                type: "String",
                required: true,
            },
            {
                name: "User",
                type: "OneToOne",
                collection: "Users",
            },
            {
                name: "Sites",
                type: "ManyToMany",
                collection: "Sites",
                includeFields: ["Name"],
                twoWay: "Contacts",
                preserve: true,
            },
        ],
    }
}

export default Contacts

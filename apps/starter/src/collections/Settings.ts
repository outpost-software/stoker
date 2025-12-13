import type { CollectionSchema, GenerateSchema } from "@stoker-platform/types"

const Settings: GenerateSchema = (): CollectionSchema => {
    return {
        singleton: true,
        labels: {
            collection: "Settings",
            record: "Settings",
        },
        access: {
            operations: {
                read: ["Office", "Client"],
                create: ["Office"],
                update: ["Office"],
                delete: ["Office"],
            },
        },
        indexExemption: true,
        recordTitleField: "Company_Name",
        admin: {
            navbarPosition: 9,
        },
        fields: [
            {
                name: "Company_Name",
                type: "String",
                required: true,
                maxlength: 255,
                admin: {
                    label: "Company Name",
                },
            },
            {
                name: "Company_Logo",
                type: "String",
                pattern: "^https://firebasestorage\\.googleapis\\.com/.*$",
                admin: {
                    label: "Company Logo",
                },
                access: ["Office", "Area Manager"],
            },
        ],
    }
}

export default Settings

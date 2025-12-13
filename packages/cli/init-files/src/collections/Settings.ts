import type { CollectionSchema, GenerateSchema } from "@stoker-platform/types"
import { blueField } from "../utils.js"
import { Building2, SettingsIcon } from "lucide-react"

const Settings: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Settings",
            record: "Settings",
        },
        singleton: true,
        access: {
            operations: {
                assignable: ["Admin"],
                read: ["Admin"],
                create: ["Admin"],
                update: ["Admin"],
                delete: ["Admin"],
            },
        },
        indexExemption: true,
        recordTitleField: "Organization_Name",
        admin: {
            navbarPosition: 4,
            icon: SettingsIcon as React.FC,
        },
        fields: [
            {
                name: "Organization_Name",
                type: "String",
                required: true,
                admin: {
                    label: "Organization Name",
                    icon: {
                        component: Building2 as React.FC,
                        className: blueField,
                    },
                },
            },
        ],
    }
}

export default Settings

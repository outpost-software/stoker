import type { CollectionSchema, GenerateSchema } from "@stoker-platform/types"

const Vehicles: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Vehicles",
            record: "Vehicle",
        },
        parentCollection: "Contacts",
        access: {
            serverReadOnly: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
            serverWriteOnly: true,
            operations: {
                assignable: true,
            },
        },
        enableWriteLog: true,
        custom: {
            disableOfflineCreate: true,
        },
        recordTitleField: "Name",
        fields: [
            {
                name: "Name",
                type: "String",
                required: true,
                maxlength: 255,
            },
            {
                name: "Description",
                type: "String",
                access: ["Office", "Area Manager"],
            },
            {
                name: "Contacts",
                type: "ManyToMany",
                collection: "Contacts",
            },
            {
                name: "Company",
                type: "OneToMany",
                collection: "Companies",
                access: ["Office"],
            },
            {
                name: "User",
                type: "OneToMany",
                collection: "Users",
                dependencyFields: [{ field: "Name", roles: ["Office", "Area Manager"] }],
            },
            {
                name: "Service",
                type: "OneToOne",
                collection: "Services",
                twoWay: "Vehicle",
            },
        ],
    }
}

export default Vehicles

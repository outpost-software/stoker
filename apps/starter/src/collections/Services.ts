import type { CollectionSchema, GenerateSchema } from "@stoker-platform/types"

const Services: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Services",
            record: "Service",
        },
        enableWriteLog: true,
        parentCollection: "Vehicles",
        access: {
            serverReadOnly: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
            serverWriteOnly: true,
            operations: {
                assignable: true,
            },
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
                name: "Contact",
                type: "OneToOne",
                collection: "Contacts",
            },
            {
                name: "Vehicle",
                type: "OneToOne",
                collection: "Vehicles",
                dependencyFields: [{ field: "Name", roles: ["Subcontractor"] }],
                twoWay: "Service",
            },
            {
                name: "Kilometers",
                type: "Number",
                restrictUpdate: ["Office"],
            },
        ],
    }
}

export default Services

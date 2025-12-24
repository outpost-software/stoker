import type { CollectionSchema, GenerateSchema } from "@stoker-platform/types"

const Buildings: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Buildings",
            record: "Building",
        },
        parentCollection: "Contacts",
        access: {
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
                admin: {
                    condition: {
                        form() {
                            return true
                        },
                    },
                },
            },
            {
                name: "Description",
                type: "String",
                access: ["Office", "Area Manager"],
                required: true,
                singleFieldExemption: true,
            },
        ],
    }
}

export default Buildings

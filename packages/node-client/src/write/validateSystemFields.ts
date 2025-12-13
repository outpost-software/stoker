import { StokerRecord } from "@stoker-platform/types"
import { systemFields } from "@stoker-platform/utils"
import isEqual from "lodash/isEqual.js"

export const validateSystemFields = (
    operation: "create" | "update",
    data: Partial<StokerRecord>,
    originalSystemFields: Partial<StokerRecord>,
) => {
    if (operation === "create") {
        systemFields.forEach((field) => {
            // eslint-disable-next-line security/detect-object-injection
            if (!isEqual(data[field], originalSystemFields[field])) {
                throw new Error(`Updating system fields in hooks is not allowed: ${field}`)
            }
        })
    }
    if (operation === "update") {
        ;["id", "Collection_Path", "Created_At", "Saved_At", "Created_By"].forEach((field) => {
            if (field in data) {
                throw new Error(`Cannot update system field: ${field}`)
            }
        })

        systemFields.forEach((field) => {
            if (!["id", "Collection_Path", "Created_At", "Saved_At", "Created_By"].includes(field)) {
                // eslint-disable-next-line security/detect-object-injection
                if (!isEqual(data[field], originalSystemFields[field])) {
                    throw new Error(`Updating system fields in hooks is not allowed: ${field}`)
                }
            }
        })
    }
}

import type { CollectionField, SystemField } from "@stoker-platform/types"
import { systemFields } from "./system-fields.js"

export const getSystemFieldsSchema = () => {
    return systemFields.map((field) => {
        let type = ""
        let values
        switch (field) {
            case "id":
                type = "String"
                break
            case "Collection_Path":
                type = "Array"
                break
            case "Created_At":
                type = "Timestamp"
                break
            case "Saved_At":
                type = "Timestamp"
                break
            case "Created_By":
                type = "String"
                break
            case "Last_Write_At":
                type = "Timestamp"
                break
            case "Last_Save_At":
                type = "Timestamp"
                break
            case "Last_Write_By":
                type = "String"
                break
            case "Last_Write_App":
                type = "String"
                break
            case "Last_Write_Connection_Status":
                type = "String"
                values = ["Online", "Offline"]
                break
            case "Last_Write_Version":
                type = "Number"
                break
        }
        type SystemFieldSchema = {
            name: SystemField
            type: string
            required: boolean
            values?: string[]
        }
        const fieldSchema: SystemFieldSchema = {
            name: field,
            type: type,
            required: true,
        }
        if (values) {
            fieldSchema.values = values
        }
        return fieldSchema as CollectionField
    })
}

import { getDatabase } from "firebase-admin/database"
import type { CollectionsSchema } from "@stoker-platform/types"
import { getFieldCustomization } from "@stoker-platform/utils"
import { getCustomizationFile } from "../initializeStoker"

export const fetchCurrentSchema = async (includeComputedFields: boolean = false) => {
    const rtdb = getDatabase()
    const ref = rtdb.ref("schema")

    const schemaSnapshot = await ref.orderByChild("published_time").limitToLast(1).get()

    const schema = Object.values(schemaSnapshot.val())[0] as CollectionsSchema

    if (!includeComputedFields) {
        for (const collection of Object.values(schema.collections)) {
            collection.fields = collection.fields.filter((field) => field.type !== "Computed")
        }
    } else {
        for (const collection of Object.values(schema.collections)) {
            for (const field of collection.fields) {
                if (field.type === "Computed") {
                    const fieldCustomization = getFieldCustomization(
                        field,
                        getCustomizationFile(collection.labels.collection, schema),
                    )
                    if (fieldCustomization.formula) {
                        field.formula = fieldCustomization.formula
                    }
                }
            }
        }
    }

    return schema
}

export const fetchLastSchema = async () => {
    const rtdb = getDatabase()
    const ref = rtdb.ref("schema")

    const schemaSnapshot = await ref.orderByChild("published_time").limitToLast(2).get()

    if (schemaSnapshot.numChildren() < 2) return
    return Object.values(schemaSnapshot.val())[0] as CollectionsSchema
}

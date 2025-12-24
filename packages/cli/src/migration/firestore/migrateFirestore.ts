import { CollectionsSchema } from "@stoker-platform/types"
import { deleteField } from "./operations/deleteField.js"

export const migrateFirestore = async (currentSchema: CollectionsSchema, lastSchema: CollectionsSchema | undefined) => {
    console.log("Migrating Firestore...")
    if (lastSchema) {
        await deleteField(currentSchema, lastSchema)
    }
    return
}

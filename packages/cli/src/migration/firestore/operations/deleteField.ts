import { CollectionField, CollectionsSchema } from "@stoker-platform/types"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { appendFileSync } from "fs"
import { join } from "path"

export const deleteField = async (currentSchema: CollectionsSchema, lastSchema: CollectionsSchema) => {
    const deletedFields: string[] = []

    const currentSchemaKeys = Object.keys(currentSchema.collections)
    const lastSchemaKeys = Object.keys(lastSchema.collections)

    lastSchemaKeys.forEach((collection) => {
        if (currentSchemaKeys.includes(collection)) {
            // eslint-disable-next-line security/detect-object-injection
            for (const field of lastSchema.collections[collection].fields) {
                if (
                    // eslint-disable-next-line security/detect-object-injection
                    !currentSchema.collections[collection].fields.filter(
                        (lastField: CollectionField) => lastField.name === field.name,
                    ).length
                ) {
                    deletedFields.push(`${collection}.${field.name}`)
                }
            }
        }
    })

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const filePath = join(process.cwd(), ".migration", process.env.GCP_PROJECT!, `v${currentSchema.version.toString()}`)

    const db = await getFirestore()
    const bulkWriter = db.bulkWriter()
    for (const field of deletedFields) {
        const [collection, fieldName] = field.split(".")
        // eslint-disable-next-line security/detect-object-injection
        const fieldSchema = currentSchema.collections[collection].fields.find(
            (field: CollectionField) => field.name === fieldName,
        )
        if (!fieldSchema) continue
        console.log(`Deleting field ${fieldName} from collection ${collection}...`)

        bulkWriter.onWriteResult((documentRef) => {
            // eslint-disable-next-line security/detect-non-literal-fs-filename
            appendFileSync(
                filePath,
                `Deleted field ${fieldName} from document ${documentRef.id} in collection ${collection}\n\n`,
            )
        })
        bulkWriter.onWriteError((error) => {
            console.log(error)
            return true
        })
        const querySnapshot = await db.collectionGroup(collection).get()
        for (const doc of querySnapshot.docs) {
            const tenantId = doc.ref.path.split("/")[1]
            if (doc.get(fieldName) !== undefined) {
                bulkWriter.set(
                    db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_migration")
                        .doc(currentSchema.version.toString())
                        .collection(collection)
                        .doc(doc.id),
                    {
                        [fieldName]: doc.get(fieldName),
                    },
                    { merge: true },
                )
            }
            bulkWriter.update(doc.ref, { [fieldName]: FieldValue.delete() })
        }
    }
    await bulkWriter.close()

    return
}

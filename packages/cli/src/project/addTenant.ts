import { input } from "@inquirer/prompts"
import { fetchCurrentSchema, initializeFirebase, initializeStoker } from "@stoker-platform/node-client"
import { CollectionSchema } from "@stoker-platform/types"
import { getFirestore } from "firebase-admin/firestore"
import { join } from "path"
import { retryOperation, isRelationField } from "@stoker-platform/utils"
import { addRecordPrompt } from "./addRecordPrompt.js"

export const addTenant = async () => {
    await initializeFirebase()
    const db = getFirestore()
    const doc = await db.collection("tenants").add({})
    const tenantId = doc.id

    await initializeStoker(
        "production",
        tenantId,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )

    const schema = await fetchCurrentSchema()

    const collections = Object.entries(schema.collections)
    for (const collectionSchema of collections) {
        const [collectionName, collection] = collectionSchema
        const { fields } = collection as CollectionSchema
        for (const field of fields) {
            if ("autoIncrement" in field && field.autoIncrement) {
                const initialValue = await input({
                    message: `Initial value for ${field.name} in collection ${collectionName}`,
                })
                await db
                    .collection("tenants")
                    .doc(tenantId)
                    .collection("system_auto_increment")
                    .doc(collectionName)
                    .collection("fields")
                    .doc(field.name)
                    .set({ number: parseInt(initialValue) })
            }
        }
    }

    const collectionRecordCreated: string[] = []
    const relationIds: Record<string, string> = {}

    for (const [collectionName, collection] of Object.entries(schema.collections)) {
        if (collection.auth || collection.singleton) {
            for (const field of collection.fields) {
                if (isRelationField(field) && field.required) {
                    if (!collectionRecordCreated.includes(field.collection)) {
                        await retryOperation(
                            async () => {
                                const result = await addRecordPrompt(tenantId, field.collection, collection.auth)
                                relationIds[field.collection] = result.id
                            },
                            [],
                            (error: unknown) => console.log(error),
                            0,
                        )
                        collectionRecordCreated.push(field.collection)
                    }
                }
            }
            if (!collectionRecordCreated.includes(collectionName)) {
                await retryOperation(
                    async () => {
                        await addRecordPrompt(tenantId, collectionName, collection.auth, undefined, relationIds)
                    },
                    [],
                    (error: unknown) => console.log(error),
                    0,
                )
                collectionRecordCreated.push(collectionName)
            }
        }
    }
    console.log(`Tenant ${tenantId} created successfully.`)
    return
}

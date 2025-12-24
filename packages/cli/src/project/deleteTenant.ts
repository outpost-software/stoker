import { fetchCurrentSchema, initializeFirebase } from "@stoker-platform/node-client"
import { getAuth } from "firebase-admin/auth"
import { CollectionReference, getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { getApp } from "firebase-admin/app"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteTenant = async (options: any) => {
    await initializeFirebase()
    const app = getApp()
    const auth = getAuth()
    const db = getFirestore()
    const storage = getStorage()

    const schema = await fetchCurrentSchema()

    const users = await db.collection("tenants").doc(options.tenant).collection("system_user_permissions").get()
    for (const snapshot of users.docs) {
        await auth.deleteUser(snapshot.id)
    }

    const deleteCollectionRecursively = async (collectionRef: CollectionReference) => {
        const snapshots = await collectionRef.get()
        for (const doc of snapshots.docs) {
            const subcollections = await doc.ref.listCollections()
            for (const subcollection of subcollections) {
                await deleteCollectionRecursively(subcollection)
            }
            await doc.ref.delete()
        }
    }

    const tenantRef = db.collection("tenants").doc(options.tenant)
    const subcollections = await tenantRef.listCollections()
    for (const subcollection of subcollections) {
        if (subcollection.id === "system_auto_increment" || subcollection.id === "system_fields") {
            for (const collection of Object.values(schema.collections)) {
                const subcollections = await subcollection.doc(collection.labels.collection).listCollections()
                for (const subcollection of subcollections) {
                    await deleteCollectionRecursively(subcollection)
                }
            }
        }
        await deleteCollectionRecursively(subcollection)
    }
    await tenantRef.delete()

    const bucket = storage.bucket(app.options.projectId)
    const [files] = await bucket.getFiles({
        prefix: `${options.tenant}/`,
    })
    await Promise.all(files.map((file) => file.delete()))
    console.log("Tenant deleted.")
    process.exit()
}

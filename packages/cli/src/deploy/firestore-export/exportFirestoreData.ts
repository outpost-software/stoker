import { initializeFirebase, fetchCurrentSchema, runChildProcess } from "@stoker-platform/node-client"
import type { CollectionsSchema } from "@stoker-platform/types"

export const exportFirestoreData = async () => {
    await initializeFirebase()

    const schema: CollectionsSchema = await fetchCurrentSchema()

    const bucket = process.env.FB_FIRESTORE_EXPORT_BUCKET

    let collections = []

    for (let i = 0; i < Object.keys(schema.collections).length; i++) {
        // eslint-disable-next-line security/detect-object-injection
        collections.push(Object.keys(schema.collections)[i])
        if (i == Object.keys(schema.collections).length - 1 || collections.length == 100) {
            console.log(`Exporting ${collections.length} collections...`)
            try {
                await runChildProcess("gcloud", [
                    "firestore",
                    "export",
                    `gs://${bucket}/`,
                    `--collection-ids=${collections.join(",")}`,
                    `--project=${process.env.GCP_PROJECT}`,
                    "--quiet",
                ])
                collections = []
            } catch {
                throw new Error("Error exporting Firestore data.")
            }
        }
    }

    process.exit()
}

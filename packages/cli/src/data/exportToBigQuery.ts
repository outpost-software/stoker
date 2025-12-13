import { BigQuery } from "@google-cloud/bigquery"
import type { JobLoadMetadata } from "@google-cloud/bigquery"
import { Storage } from "@google-cloud/storage"
import { initializeFirebase } from "@stoker-platform/node-client"
import { getApp } from "firebase-admin/app"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const exportToBigQuery = async (options: any) => {
    await initializeFirebase()
    const app = getApp()
    const bigqueryClient = new BigQuery({ projectId: app.options.projectId })
    const storage = new Storage({ projectId: app.options.projectId })

    const collection = options.collection

    // GET LATEST COLLECTION FILE

    const bucket = `gs://${process.env.FB_FIRESTORE_EXPORT_BUCKET}`

    const [files] = await storage.bucket(bucket).getFiles()

    const collectionFiles = files.filter((file) =>
        file.name.includes(`all_namespaces_kind_${collection}.export_metadata`),
    )

    if (!collectionFiles.length) {
        console.log(`No files for collection ${collection} found in Cloud Storage bucket.`)
        process.exit()
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { name: latestFile } = collectionFiles.at(-1)!

    // CREATE BIGQUERY DATASET

    const [datasets] = await bigqueryClient.getDatasets()
    datasets.filter((dataset) => dataset.id === collection)

    if (!datasets.length) {
        const options = { location: process.env.FB_FIRESTORE_REGION }

        const [dataset] = await bigqueryClient.createDataset(collection, options)
        console.log(`Dataset ${dataset.id} created.`)
    }

    // EXPORT COLLECTION TO BIGQUERY

    const datetime = new Date().toISOString().split(".")[0].replaceAll(":", "-")

    const jobConfig: JobLoadMetadata = { sourceFormat: "DATASTORE_BACKUP" }
    if (options.fields) jobConfig.projectionFields = options.fields.split(",")

    const [job] = await bigqueryClient
        .dataset(collection, { location: process.env.FB_FIRESTORE_REGION })
        .table(datetime)
        .load(storage.bucket(bucket).file(latestFile), jobConfig)

    console.log(`Job ${job.id} completed.`)

    process.exit()
}

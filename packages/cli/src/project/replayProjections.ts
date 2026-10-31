import { fetchCurrentSchema, initializeFirebase } from "@stoker-platform/node-client"
import { replayCollectionProjections } from "../migration/firestore/operations/replayProjections.js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const replayProjections = async (options: any) => {
    await initializeFirebase()
    const schema = await fetchCurrentSchema()
    await replayCollectionProjections(schema, options.collection)
    console.log(`Projections replayed for collection ${options.collection}.`)
    process.exit()
}

import { initializeFirebase } from "@stoker-platform/node-client"
import { getFirestore } from "firebase-admin/firestore"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setDeploymentStatus = async (status: "idle" | "in_progress") => {
    await initializeFirebase()
    const db = getFirestore()
    if (!["idle", "in_progress"].includes(status)) {
        throw new Error("Invalid deployment status")
    }
    await db.runTransaction(async (transaction) => {
        if (status === "in_progress") {
            const deploymentStatus = await transaction.get(db.collection("system_deployment").doc("status"))
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (deploymentStatus.exists && deploymentStatus.data()!.status === "in_progress") {
                throw new Error("Deployment already in progress. Please try again later.")
            }
        }
        transaction.set(db.collection("system_deployment").doc("status"), { status })
    })
    console.info(`DEPLOYMENT STATUS SET TO ${status.toUpperCase()}\n`)
    return
}

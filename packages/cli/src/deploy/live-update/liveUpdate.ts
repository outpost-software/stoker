import { fetchCurrentSchema, initializeFirebase } from "@stoker-platform/node-client"
import { VersionInfo } from "@stoker-platform/types"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const liveUpdate = async (options: any) => {
    await initializeFirebase()
    const db = getFirestore()
    const batch = db.batch()
    const currentSchema = await fetchCurrentSchema()
    const deployId = db.collection("system_deployment").doc("latest_deploy").collection("deploy_history").doc().id
    const versionInfo: VersionInfo = {
        version: currentSchema.version,
        force: options.secure || false,
        refresh: options.refresh || false,
        time: FieldValue.serverTimestamp(),
        payload: options.payload || {},
    }
    batch.set(db.collection("system_deployment").doc("latest_deploy"), versionInfo)
    batch.set(
        db.collection("system_deployment").doc("latest_deploy").collection("deploy_history").doc(deployId),
        versionInfo,
    )
    await batch.commit()
    console.info("LIVE UPDATE TRIGGERED")
    process.exit()
}

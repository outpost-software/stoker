import { waitForPendingWrites as waitForPendingFirestoreWrites } from "firebase/firestore"
import { getFirestoreWrite, getStokerFirestore } from "../initializeStoker"

export const waitForPendingWrites = async () => {
    const firestoreInstances = [getStokerFirestore(), getFirestoreWrite()]
    for (const firestoreInstance of Object.values(firestoreInstances)) {
        await waitForPendingFirestoreWrites(firestoreInstance).catch((error) => {
            throw new Error(`Error waiting for pending writes in ${firestoreInstance.app.name}.`, { cause: error })
        })
    }
    return
}

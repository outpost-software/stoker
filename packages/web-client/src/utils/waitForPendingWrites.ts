import { getFirestore, waitForPendingWrites as waitForPendingFirestoreWrites } from "firebase/firestore"
import { getFirestoreWrite } from "../initializeStoker"

export const waitForPendingWrites = async () => {
    const firestoreInstances = [getFirestore(), getFirestoreWrite()]
    for (const firestoreInstance of Object.values(firestoreInstances)) {
        await waitForPendingFirestoreWrites(firestoreInstance).catch((error) => {
            throw new Error(`Error waiting for pending writes in ${firestoreInstance.app.name}.`, { cause: error })
        })
    }
    return
}

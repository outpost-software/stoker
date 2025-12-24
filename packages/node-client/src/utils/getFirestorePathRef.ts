import { Firestore } from "firebase-admin/firestore"

export const getFirestorePathRef = (db: Firestore, path: string[], tenantId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ref: any = db.collection("tenants").doc(tenantId)
    for (let i = 0; i < path.length; i++) {
        if (i % 2 === 0) {
            // eslint-disable-next-line security/detect-object-injection
            ref = ref.collection(path[i])
        } else {
            // eslint-disable-next-line security/detect-object-injection
            ref = ref.doc(path[i])
        }
    }
    return ref
}

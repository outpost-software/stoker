import { getFirestore, Transaction } from "firebase-admin/firestore"
import { getTenant } from "../initializeStoker"

export const lockRecord = async (transaction: Transaction, docId: string, userId: string) => {
    const tenantId = getTenant()
    const db = getFirestore()

    const lockIds = [docId]
    if (userId && userId.trim() !== "") {
        lockIds.push(userId)
    }
    lockIds.sort()

    const lockRefs = []
    for (const id of lockIds) {
        const lockRef = db.collection("tenants").doc(tenantId).collection("system_locks").doc(id)
        const lockSnapshot = await transaction.get(lockRef)
        if (lockSnapshot.exists) {
            throw new Error("DOCUMENT_LOCKED")
        }
        lockRefs.push(lockRef)
    }

    for (const lockRef of lockRefs) {
        transaction.set(lockRef, { locked: true })
    }

    return
}

export const unlockRecord = async (docId: string, userId: string) => {
    const tenantId = getTenant()
    const db = getFirestore()

    const lockIds = [docId]
    if (userId && userId.trim() !== "") {
        lockIds.push(userId)
    }
    lockIds.sort()

    const batch = db.batch()
    for (const id of lockIds) {
        const lockRef = db.collection("tenants").doc(tenantId).collection("system_locks").doc(id)
        batch.delete(lockRef)
    }

    await batch.commit()

    return
}

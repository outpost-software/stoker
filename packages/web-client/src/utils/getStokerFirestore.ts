import { getFirestore, Firestore } from "firebase/firestore"
import { getFirestoreDatabaseId } from "@stoker-platform/utils"

let databaseId: string | undefined

export const configureStokerFirestore = (edition: string | undefined, projectId: string) => {
    const id = getFirestoreDatabaseId(edition, projectId)
    databaseId = id === "(default)" ? undefined : id
}

export const getStokerFirestoreDatabaseId = (): string | undefined => databaseId

export const getStokerFirestore = (): Firestore => {
    if (databaseId) {
        return getFirestore(databaseId)
    }
    return getFirestore()
}

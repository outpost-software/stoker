import { getOne } from "../read/getOne.js"
import { CollectionPermissions, CollectionSchema, StokerPermissions } from "@stoker-platform/types"
import { collectionAccess } from "@stoker-platform/utils"
import { Transaction } from "firebase-admin/firestore"

// TODO: subcollection support
export const getRecordAccess = async (
    transaction: Transaction,
    collection: CollectionSchema,
    id: string,
    user: string,
    permissions: StokerPermissions,
) => {
    if (!collectionAccess("Read", permissions.collections?.[collection.labels.collection] as CollectionPermissions))
        return false
    try {
        await getOne([collection.labels.collection], id, { user, providedTransaction: transaction })
    } catch {
        return false
    }
    return true
}

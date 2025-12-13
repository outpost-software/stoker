import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { callOpenCreateModal } from "../providers/CreateProvider"

export const createRecordForm = (collection: CollectionSchema, collectionPath: string[], record?: StokerRecord) => {
    return callOpenCreateModal(collection, collectionPath, record)
}

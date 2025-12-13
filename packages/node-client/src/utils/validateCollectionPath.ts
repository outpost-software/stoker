import { CollectionSchema } from "@stoker-platform/types"
import { getOne } from "../read/getOne"
import isEqual from "lodash/isEqual.js"

export const validateCollectionPath = async (path: string[], collectionSchema: CollectionSchema) => {
    const { labels, parentCollection } = collectionSchema
    if (parentCollection) {
        const parentDocumentId = path.at(-2)
        if (!parentDocumentId) throw new Error("PERMISSION_DENIED")
        const parentCollectionPath = [...path].slice(0, -2)
        const parentRecord = await getOne(parentCollectionPath, parentDocumentId).catch(() => {
            throw new Error("PERMISSION_DENIED")
        })
        const parentDocumentPath = parentRecord.Collection_Path
        parentDocumentPath.push(parentRecord.id)
        parentDocumentPath.push(labels.collection)
        if (!isEqual(path, parentDocumentPath)) throw new Error("PERMISSION_DENIED")
    } else if (path.length > 1) {
        throw new Error("PERMISSION_DENIED")
    }
    return
}

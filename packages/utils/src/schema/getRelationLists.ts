import { CollectionSchema, StokerCollection } from "@stoker-platform/types"

export const getRelationLists = (collection: StokerCollection, collections: CollectionSchema[]) => {
    const fields = new Map<string, { field: string; roles: string[] }>()
    for (const collectionSchema of collections) {
        if (collectionSchema.relationLists) {
            for (const relationList of collectionSchema.relationLists) {
                if (relationList.collection === collection) {
                    fields.set(relationList.field, { field: relationList.field, roles: relationList.roles || [] })
                }
            }
        }
    }
    return fields
}

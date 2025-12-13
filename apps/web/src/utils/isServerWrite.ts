import { CollectionSchema, StokerRecord, UserData } from "@stoker-platform/types"

export const isServerCreate = (collection: CollectionSchema, user?: UserData) => {
    const { auth, access } = collection
    const { serverWriteOnly } = access
    return !!(serverWriteOnly || (auth && user?.operation === "create"))
}

export const isServerUpdate = (collection: CollectionSchema, record: Partial<StokerRecord>, user?: UserData) => {
    const { auth, access } = collection
    const { serverWriteOnly } = access
    return !!(
        serverWriteOnly ||
        (auth && user?.operation) ||
        record.Role ||
        record.Enabled !== undefined ||
        record.Name ||
        record.Email ||
        record.Photo_URL
    )
}

export const isServerDelete = (collection: CollectionSchema, record: StokerRecord) => {
    const { auth, access } = collection
    const { serverWriteOnly } = access
    return !!(serverWriteOnly || (auth && record.User_ID))
}

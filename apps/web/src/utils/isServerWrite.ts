import { CollectionSchema, StokerRecord, UserData } from "@stoker-platform/types"

export const isServerCreate = (collection: CollectionSchema, user?: UserData) => {
    const { auth, access } = collection
    const { serverWriteOnly } = access
    return !!(serverWriteOnly || (auth && user?.operation === "create"))
}

export const isServerUpdate = (collection: CollectionSchema, record: Partial<StokerRecord>, user?: UserData) => {
    const { auth, access, fields } = collection
    const { serverWriteOnly } = access
    const tokenFields = fields.filter((field) => field.saveToAuthToken)
    return !!(
        serverWriteOnly ||
        (auth && user?.operation) ||
        record.Role ||
        record.Enabled !== undefined ||
        record.Name ||
        record.Email ||
        record.Photo_URL ||
        tokenFields.some((field) => record[field.name] !== undefined)
    )
}

export const isServerDelete = (collection: CollectionSchema, record: StokerRecord) => {
    const { auth, access } = collection
    const { serverWriteOnly } = access
    return !!(serverWriteOnly || (auth && record.User_ID))
}

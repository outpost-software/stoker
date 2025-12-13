import { CollectionSchema, StokerRecord, UserData } from "@stoker-platform/types"
import { getCachedConfigValue, getCollectionConfigModule, getConnectionStatus } from "@stoker-platform/web-client"

export const isOfflineDisabled = async (
    operation: "create" | "update" | "delete" | "restore",
    collection: CollectionSchema,
    record?: Partial<StokerRecord>,
    userData?: UserData,
) => {
    const { labels, auth, access } = collection
    const { serverWriteOnly } = access
    const customization = getCollectionConfigModule(labels.collection)

    const offline = getConnectionStatus() === "Offline"

    if (serverWriteOnly) return offline

    if (operation === "create") {
        const offlineCreateDisabled = await getCachedConfigValue(customization, [
            "collections",
            labels.collection,
            "custom",
            "disableOfflineCreate",
        ])
        if (offlineCreateDisabled) return offline
    }

    if (operation === "update") {
        const offlineUpdateDisabled = await getCachedConfigValue(customization, [
            "collections",
            labels.collection,
            "custom",
            "disableOfflineUpdate",
        ])
        if (offlineUpdateDisabled) return offline
    }

    if (operation === "delete" || operation === "restore") {
        const offlineDeleteDisabled = await getCachedConfigValue(customization, [
            "collections",
            labels.collection,
            "custom",
            "disableOfflineDelete",
        ])
        if (offlineDeleteDisabled) return offline
    }

    if (operation === "update" && !record) {
        throw new Error("Record is required for update operation")
    }

    if (operation === "create" && userData?.operation === "create") {
        return offline
    }

    if (operation === "update") {
        const createUserRequest = auth && userData?.operation === "create"
        const deleteUserRequest = auth && userData?.operation === "delete"
        const updateUserRequest =
            record &&
            collection.auth &&
            !createUserRequest &&
            !deleteUserRequest &&
            (userData?.operation === "update" ||
                record.Role ||
                record.Enabled !== undefined ||
                record.Name ||
                record.Email ||
                record.Photo_URL)
        if (createUserRequest || updateUserRequest || deleteUserRequest) {
            return offline
        }
    }

    if (operation === "delete" && record?.User_ID) {
        return offline
    }

    return false
}

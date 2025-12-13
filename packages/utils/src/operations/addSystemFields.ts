import { CollectionsSchema, FirebaseTimestamp, StokerRecord } from "@stoker-platform/types"

export const addSystemFields = (
    operation: "create" | "update" | "delete",
    path: string[],
    data: Partial<StokerRecord>,
    schema: CollectionsSchema,
    appName: string,
    connection: "Online" | "Offline",
    userId: string,
    timestamp: FirebaseTimestamp,
    serverTimestamp: FirebaseTimestamp,
    retry?: boolean,
) => {
    if (operation == "create") {
        data.Collection_Path = path
        if (!retry) data.Created_At = timestamp
        data.Saved_At = serverTimestamp
        data.Created_By = userId || "System"
    }
    data.Last_Write_App = appName
    if (!retry) data.Last_Write_At = timestamp
    data.Last_Save_At = serverTimestamp
    data.Last_Write_By = userId || "System"
    data.Last_Write_Connection_Status = connection
    data.Last_Write_Version = schema.version

    return data as StokerRecord
}

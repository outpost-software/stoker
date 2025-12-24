import { StokerRecord } from "@stoker-platform/types"

export const getRecordSystemFields = (record: StokerRecord) => {
    const systemFields: Record<string, unknown> = {
        Last_Write_At: record.Last_Write_At,
        Last_Write_By: record.Last_Write_By,
        Last_Write_Connection_Status: record.Last_Write_Connection_Status,
        Last_Write_Version: record.Last_Write_Version,
        Last_Write_App: record.Last_Write_App,
        Last_Save_At: record.Last_Save_At,
    }
    return systemFields
}

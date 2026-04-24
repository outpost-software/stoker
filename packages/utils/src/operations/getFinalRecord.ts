export const getFinalRecord = (args: IArguments) => {
    const data = args[0]
    if (!("data" in data)) return
    if ("originalRecord" in data && data.originalRecord) {
        return {
            ...data.originalRecord,
            ...data.data,
        }
    }
    return data.data
}

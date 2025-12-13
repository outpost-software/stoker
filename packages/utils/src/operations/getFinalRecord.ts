export const getFinalRecord = (args: IArguments) => {
    const record = args[1]
    const originalRecord = Array.from(args).at(-1)
    if (originalRecord) {
        return {
            ...originalRecord,
            ...record,
        }
    }
    return record
}

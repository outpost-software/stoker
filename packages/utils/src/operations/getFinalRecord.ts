import { HookArgs } from "@stoker-platform/types"

export const getFinalRecord = (args: HookArgs) => {
    if (!("data" in args)) return
    if ("originalRecord" in args && args.originalRecord) {
        return {
            ...args.originalRecord,
            ...args.data,
        }
    }
    return args.data
}

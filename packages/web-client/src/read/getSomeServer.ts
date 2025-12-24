import { httpsCallable, getFunctions } from "firebase/functions"
import { StokerRecord } from "@stoker-platform/types"
import { deserializeTimestamps } from "../utils/deserializeTimestamps"
import { getApp } from "firebase/app"
import { getEnv } from "../initializeStoker"
import { Cursor } from "../main"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getSomeServer = async (path: string[], constraints?: [string, string, unknown][], options?: any) => {
    const app = getApp()
    const env = getEnv()
    const firebaseFunctions = getFunctions(app, env.STOKER_FB_FUNCTIONS_REGION)

    const serializedConstraints = constraints?.map((constraint) => {
        if (constraint[2] instanceof Date) {
            return [constraint[0], constraint[1], constraint[2].toISOString()]
        } else {
            return constraint
        }
    })

    const getSomeApi = httpsCallable(firebaseFunctions, `stoker-readapi`)
    interface GetSomeResult {
        data: {
            result: {
                docs: StokerRecord[]
                pages: number
                cursor: Cursor
            }
        }
    }
    let getSomeResult: GetSomeResult
    if (!options?.pagination) {
        getSomeResult = (await getSomeApi({
            path,
            constraints: serializedConstraints,
            options,
            stream: true,
        })) as GetSomeResult
    } else {
        const { stream, data } = await getSomeApi.stream({
            path,
            constraints: serializedConstraints,
            options,
            stream: true,
        })
        for await (const chunk of stream) {
            console.log((chunk as GetSomeResult).data.result.docs.length)
        }
        getSomeResult = { data: await data } as GetSomeResult
    }

    const data = getSomeResult.data

    for (const doc of data.result.docs) {
        deserializeTimestamps(doc)
    }

    return data?.result
}

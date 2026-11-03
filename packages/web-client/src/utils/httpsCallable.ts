import { getAuth } from "firebase/auth"
import {
    FunctionsError,
    httpsCallable as firebaseHttpsCallable,
    type Functions,
    type HttpsCallable,
    type HttpsCallableOptions,
} from "firebase/functions"

export const httpsCallable = <RequestData = unknown, ResponseData = unknown, StreamData = unknown>(
    functionsInstance: Functions,
    name: string,
    options?: HttpsCallableOptions,
): HttpsCallable<RequestData, ResponseData, StreamData> => {
    const callable = firebaseHttpsCallable<RequestData, ResponseData, StreamData>(functionsInstance, name, options)

    const callWithRetry = async (data?: RequestData | null) => {
        try {
            return await callable(data)
        } catch (error) {
            const auth = getAuth(functionsInstance.app)
            const currentUser = auth.currentUser
            if (!(error instanceof FunctionsError && error.code === "functions/unauthenticated" && currentUser)) {
                throw error
            }
            await currentUser.getIdToken(true).catch(() => {
                throw error
            })
            return callable(data)
        }
    }

    return Object.assign(callWithRetry, { stream: callable.stream })
}

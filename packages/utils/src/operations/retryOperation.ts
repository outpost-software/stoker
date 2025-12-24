// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const retryOperation = async (callback: any, args: unknown[], errorCallback?: any, delay = 1000) => {
    let retries = 5
    while (retries > 0) {
        try {
            await callback(...args)
            break
        } catch (error: unknown) {
            retries--
            if (retries === 0) {
                throw error
            }
            if (errorCallback) {
                errorCallback(error)
            }
            await new Promise((res) => setTimeout(res, delay))
            delay *= 2
        }
    }
}

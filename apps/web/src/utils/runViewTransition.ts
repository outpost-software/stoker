import { flushSync } from "react-dom"

const isWebKit =
    typeof navigator !== "undefined" &&
    /AppleWebKit/.test(navigator.userAgent) &&
    !/Chrom(e|ium)|Edg|OPR|Android/.test(navigator.userAgent)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const runViewTransition = (callback: () => any) => {
    if (!isWebKit && document.startViewTransition && document.visibilityState === "visible") {
        try {
            const transition = document.startViewTransition(() => {
                flushSync(() => {
                    callback()
                })
            })
            transition.finished.catch(() => {})
        } catch {
            callback()
        }
    } else {
        callback()
    }
}

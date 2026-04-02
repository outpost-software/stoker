import { flushSync } from "react-dom"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const runViewTransition = (callback: () => any) => {
    if (document.startViewTransition && document.visibilityState === "visible") {
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

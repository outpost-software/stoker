import { flushSync } from "react-dom"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const runViewTransition = (callback: () => any) => {
    if (document.startViewTransition) {
        document.startViewTransition(() => {
            flushSync(() => {
                callback()
            })
        })
    } else {
        callback()
    }
}

import { useEffect, useState } from "react"

interface KeyboardViewport {
    offset: number
    viewportHeight: number
}

const getInitial = (): KeyboardViewport => {
    if (typeof window === "undefined") return { offset: 0, viewportHeight: 0 }
    const visualViewport = window.visualViewport
    if (!visualViewport) return { offset: 0, viewportHeight: window.innerHeight }
    return {
        offset: Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop),
        viewportHeight: visualViewport.height,
    }
}

export function useKeyboardOffset(enabled: boolean = true): KeyboardViewport {
    const [state, setState] = useState<KeyboardViewport>(getInitial)

    useEffect(() => {
        if (!enabled) return
        const visualViewport = window.visualViewport
        if (!visualViewport) return

        const update = () => {
            setState({
                offset: Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop),
                viewportHeight: visualViewport.height,
            })
        }
        update()

        visualViewport.addEventListener("resize", update)
        visualViewport.addEventListener("scroll", update)
        return () => {
            visualViewport.removeEventListener("resize", update)
            visualViewport.removeEventListener("scroll", update)
        }
    }, [enabled])

    return state
}

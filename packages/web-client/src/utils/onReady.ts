export const onStokerReady = (callback: () => unknown) => {
    document.addEventListener("stoker:ready", callback)
    return () => {
        document.removeEventListener("stoker:ready", callback)
    }
}

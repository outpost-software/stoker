export const onStokerSignOut = (callback: () => unknown) => {
    document.addEventListener("stoker:signOut", callback)
    return () => {
        document.removeEventListener("stoker:signOut", callback)
    }
}

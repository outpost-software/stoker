export const onStokerPermissionsChange = (callback: () => unknown) => {
    document.addEventListener("stoker:permissionsChange", callback)
    return () => {
        document.removeEventListener("stoker:permissionsChange", callback)
    }
}

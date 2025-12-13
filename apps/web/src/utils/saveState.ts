export const saveState = (key: string, value: string) => {
    const stokerState = sessionStorage.getItem("stoker-state")
    const state = stokerState ? JSON.parse(stokerState) : {}
    sessionStorage.setItem("stoker-state", JSON.stringify({ ...state, [key]: value }))
}

export const deleteState = (key: string) => {
    const stokerState = sessionStorage.getItem("stoker-state")
    const state = stokerState ? JSON.parse(stokerState) : {}
    // eslint-disable-next-line security/detect-object-injection
    delete state[key]
    sessionStorage.setItem("stoker-state", JSON.stringify(state))
}

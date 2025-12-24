export const getState = () => {
    const stokerState = sessionStorage.getItem("stoker-state")
    const state = stokerState ? JSON.parse(stokerState) : {}
    return state
}

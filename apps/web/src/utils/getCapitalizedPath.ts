export const getCapitalisedPath = (path: string) => {
    return path.split("-").map((element, index) => {
        if ((index + 1) % 2 === 0) {
            return element
        }

        // Handle snake case by capitalizing after underscore
        return element
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join("_")
    })
}

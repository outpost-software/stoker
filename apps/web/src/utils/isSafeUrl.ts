export const isSafeUrl = (url: string): boolean => {
    if (!url || typeof url !== "string") {
        return false
    }

    try {
        const parsed = new URL(url)
        return ["http:", "https:", "blob:"].includes(parsed.protocol)
    } catch {
        return false
    }
}

export const getSafeUrl = (url: string): string => {
    return isSafeUrl(url) ? url : ""
}

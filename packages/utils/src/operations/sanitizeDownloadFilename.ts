import { validateStorageName } from "./validateStorageName.js"

export const sanitizeDownloadFilename = (filename: string): string => {
    if (!filename || typeof filename !== "string") {
        return "download"
    }

    // Remove control characters
    // eslint-disable-next-line no-control-regex
    let cleaned = filename.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "")

    cleaned = cleaned.trim()

    if (!cleaned) {
        return "download"
    }

    const validationError = validateStorageName(cleaned)
    if (validationError) {
        return "download"
    }

    return cleaned
}

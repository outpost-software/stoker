export const sanitizeEmailAddress = (input: string | undefined | null): string => {
    if (!input || typeof input !== "string") {
        return ""
    }

    // Remove newlines and carriage returns that could be used for SMTP injection
    let sanitized = input.replace(/[\r\n]/g, "")

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, "")

    // Remove control characters (except tab)
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "")

    sanitized = sanitized.trim()

    // Limit length to prevent buffer overflow attacks
    const maxLength = 254 // RFC 5321 maximum email length
    if (sanitized.length > maxLength) {
        throw new Error("Email address is too long")
    }

    return sanitized
}

export const sanitizeEmailAddressArray = (input: string | string[] | undefined | null): string[] => {
    if (!input) {
        return []
    }

    const array = Array.isArray(input) ? input : [input]
    return array.map((email) => sanitizeEmailAddress(email)).filter((email) => email.length > 0)
}

export const sanitizeEmailAddressOrArray = (input: string | string[] | undefined | null): string | string[] => {
    if (!input) {
        return ""
    }

    if (Array.isArray(input)) {
        const sanitized = input.map((email) => sanitizeEmailAddress(email)).filter((email) => email.length > 0)
        return sanitized
    }

    const sanitized = sanitizeEmailAddress(input)
    return sanitized || ""
}

export const sanitizeEmailSubject = (input: string | undefined | null): string => {
    if (!input || typeof input !== "string") {
        return ""
    }

    // Remove newlines and carriage returns that could be used for header injection
    let sanitized = input.replace(/[\r\n]/g, " ")

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, "")

    // Remove control characters (except tab)
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "")

    sanitized = sanitized.trim()

    // Limit length to prevent buffer overflow attacks
    const maxLength = 998 // RFC 5322 maximum header line length
    if (sanitized.length > maxLength) {
        throw new Error("Email subject is too long")
    }

    return sanitized
}

export const sanitizeEmailBody = (input: string | undefined | null): string => {
    if (!input || typeof input !== "string") {
        return ""
    }

    // Remove null bytes
    let sanitized = input.replace(/\0/g, "")

    // Remove control characters that could be problematic (keep newlines for formatting)
    // But remove standalone \r\n sequences that could be interpreted as SMTP commands
    sanitized = sanitized.replace(/\r\n\r\n/g, "\n\n")
    sanitized = sanitized.replace(/\r\n/g, "\n")

    // Limit length to prevent buffer overflow attacks
    const maxLength = 5000000 // 5MB limit for email body
    if (sanitized.length > maxLength) {
        throw new Error("Email body is too long")
    }

    return sanitized
}

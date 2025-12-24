export const isValidUniqueFieldValue = (input: string | number) => {
    input = input.toString()
    // Check for invalid characters or patterns
    const invalidPattern = /[/]|^\.+$|^__.*__$/
    if (invalidPattern.test(input)) {
        return false
    }

    // Check for valid UTF-8 by encoding and decoding the string
    try {
        const encoded = new TextEncoder().encode(input)
        const decoded = new TextDecoder().decode(encoded)
        if (input !== decoded) {
            return false
        }
    } catch {
        return false
    }

    // Check for length in bytes
    const lengthInBytes = new Blob([input]).size
    if (lengthInBytes > 1500) {
        return false
    }

    return true
}

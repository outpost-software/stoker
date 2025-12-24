export const validateStorageName = (name: string): string | null => {
    const trimmed = name.trim()
    if (!trimmed) return "Name cannot be empty"
    if (trimmed.includes("/")) return "Name cannot contain /"
    if (/[\r\n]/.test(trimmed)) return "Name cannot contain line breaks"
    if (/[#[\]*?]/.test(trimmed)) return "Name cannot contain any of # [ ] * ?"
    if (trimmed.includes("..")) return "Name cannot contain .."
    if (trimmed === ".") return "Name cannot be ."
    const byteLength = new TextEncoder().encode(trimmed).length
    if (byteLength > 1024) return "Name must be at most 1024 bytes"
    return null
}

export const RESERVED_KEYS = ["tenant", "role", "collection", "doc"] as const

const RESERVED_SET = new Set<string>(RESERVED_KEYS)

export function isReservedClaimKey(name: string): boolean {
    return RESERVED_SET.has(name)
}

export function omitReservedClaims(claims: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (!claims) {
        return {}
    }
    const filteredClaims: Record<string, unknown> = {}
    for (const key of Object.keys(claims)) {
        if (!RESERVED_SET.has(key)) {
            // eslint-disable-next-line security/detect-object-injection
            filteredClaims[key] = claims[key]
        }
    }
    return filteredClaims
}

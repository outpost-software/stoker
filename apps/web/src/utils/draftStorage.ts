export const getDraftStorageKeys = (draftKey: string) => ({
    draftStorageKey: `stoker-draft-${draftKey}`,
    draftOwnerStorageKey: `stoker-draft-owner-${draftKey}`,
})

export const removeDraft = (draftKey: string) => {
    const { draftStorageKey, draftOwnerStorageKey } = getDraftStorageKeys(draftKey)
    localStorage.removeItem(draftStorageKey)
    localStorage.removeItem(draftOwnerStorageKey)
}

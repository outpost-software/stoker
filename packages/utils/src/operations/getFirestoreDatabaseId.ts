export const getFirestoreDatabaseId = (edition = "enterprise", projectId: string): string => {
    return edition === "enterprise" ? projectId : "(default)"
}

export const getFirestoreTriggerDatabase = (edition = "enterprise", projectId: string): string | undefined => {
    return edition === "enterprise" ? projectId : undefined
}

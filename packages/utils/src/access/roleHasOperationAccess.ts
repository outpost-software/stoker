import { CollectionSchema, StokerRole } from "@stoker-platform/types"

export const roleHasOperationAccess = (
    collection: CollectionSchema,
    role: StokerRole,
    operation: "read" | "create" | "update" | "delete",
) => {
    const { access } = collection
    // eslint-disable-next-line security/detect-object-injection
    return access.operations[operation]?.includes(role)
}

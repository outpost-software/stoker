import { CollectionSchema, StokerRole } from "@stoker-platform/types"

export const roleHasOperationAccess = (
    collection: CollectionSchema,
    role: StokerRole,
    operation: "read" | "create" | "update" | "delete",
) => {
    const { access } = collection
    return (
        access.operations.assignable === true ||
        (typeof access.operations.assignable === "object" && access.operations.assignable.includes(role)) ||
        // eslint-disable-next-line security/detect-object-injection
        access.operations[operation]?.includes(role)
    )
}

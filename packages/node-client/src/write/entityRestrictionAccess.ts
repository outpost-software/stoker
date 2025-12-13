import {
    CollectionsSchema,
    ParentEntityRestriction,
    ParentPropertyEntityRestriction,
    RelationField,
    StokerPermissions,
} from "@stoker-platform/types"
import { getRecordAccess } from "../utils/getRecordAccess"
import { Transaction } from "firebase-admin/firestore"
import { getField } from "@stoker-platform/utils"

const CONCURRENCY_LIMIT = 10

const runWithConcurrencyLimit = async (tasks: Array<() => Promise<void>>, limit: number) => {
    if (tasks.length === 0) return
    const workerCount = Math.min(limit, tasks.length)
    let nextIndex = 0
    const worker = async () => {
        while (nextIndex < tasks.length) {
            const current = nextIndex
            nextIndex += 1
            // eslint-disable-next-line security/detect-object-injection
            await tasks[current]()
        }
    }
    await Promise.all(Array.from({ length: workerCount }, worker))
}

export const entityRestrictionAccess = async (
    transaction: Transaction,
    userPermissions: StokerPermissions,
    userId: string,
    currentUserPermissions: StokerPermissions,
    schema: CollectionsSchema,
    originalPermissions?: StokerPermissions,
    batchSize?: { size: number },
) => {
    for (const [collectionName, collectionPermissions] of Object.entries(userPermissions?.collections || {})) {
        /* eslint-disable security/detect-object-injection */
        if (!schema.collections[collectionName]) throw new Error("PERMISSION_DENIED")
        const collectionAccess = schema.collections[collectionName].access
        const permissionsCollectionSchema = schema.collections[collectionName]
        const hasRestrictions =
            currentUserPermissions.collections?.[collectionName]?.restrictEntities ||
            currentUserPermissions?.collections?.[collectionName]?.recordOwner?.active ||
            currentUserPermissions?.collections?.[collectionName]?.recordUser?.active ||
            currentUserPermissions?.collections?.[collectionName]?.recordProperty?.active
        /* eslint-enable security/detect-object-injection */
        if (hasRestrictions) {
            // eslint-disable-next-line security/detect-object-injection
            const prevCollectionPermissions = originalPermissions?.collections?.[collectionName]
            const tasks: Array<() => Promise<void>> = []

            if (collectionPermissions.individualEntities) {
                const current = collectionPermissions.individualEntities
                const previous = prevCollectionPermissions?.individualEntities || []
                const toCheck = originalPermissions ? current.filter((id) => !previous.includes(id)) : current
                for (const individualEntity of toCheck) {
                    if (batchSize) batchSize.size++
                    if (batchSize && batchSize.size > 500) {
                        throw new Error(
                            `VALIDATION_ERROR: The number of operations in the Firestore transaction has exceeded the limit of 500. This is likely due to a large number of unique field checks or entity restrictions (in permissions when dealing with user collections).`,
                        )
                    }
                    tasks.push(async () => {
                        const access = await getRecordAccess(
                            transaction,
                            permissionsCollectionSchema,
                            individualEntity,
                            userId,
                            currentUserPermissions,
                        )
                        if (!access) {
                            throw new Error("PERMISSION_DENIED")
                        }
                    })
                }
            }

            if (collectionPermissions.parentEntities) {
                const entityRestriction = collectionAccess.entityRestrictions?.restrictions?.find(
                    (restriction) =>
                        restriction.type === "Parent" &&
                        restriction.roles.some((role) => role.role === userPermissions.Role),
                ) as ParentEntityRestriction | undefined
                if (!entityRestriction) throw new Error("PERMISSION_DENIED")
                const collectionField = getField(
                    permissionsCollectionSchema.fields,
                    entityRestriction.collectionField,
                ) as RelationField
                const parentCollection = schema.collections[collectionField.collection]
                const current = collectionPermissions.parentEntities
                const previous = prevCollectionPermissions?.parentEntities || []
                const toCheck = originalPermissions ? current.filter((id) => !previous.includes(id)) : current
                for (const parentEntity of toCheck) {
                    if (batchSize) batchSize.size++
                    if (batchSize && batchSize.size > 500) {
                        throw new Error(
                            `VALIDATION_ERROR: The number of operations in the Firestore transaction has exceeded the limit of 500. This is likely due to a large number of unique field checks or entity restrictions (in permissions when dealing with user collections).`,
                        )
                    }
                    tasks.push(async () => {
                        const access = await getRecordAccess(
                            transaction,
                            parentCollection,
                            parentEntity,
                            userId,
                            currentUserPermissions,
                        )
                        if (!access) {
                            throw new Error("PERMISSION_DENIED")
                        }
                    })
                }
            }

            if (collectionPermissions.parentPropertyEntities) {
                const entityRestriction = collectionAccess.entityRestrictions?.restrictions?.find(
                    (restriction) =>
                        restriction.type === "Parent_Property" &&
                        restriction.roles.some((role) => role.role === userPermissions.Role),
                ) as ParentPropertyEntityRestriction | undefined
                if (!entityRestriction) throw new Error("PERMISSION_DENIED")
                const collectionField = getField(
                    permissionsCollectionSchema.fields,
                    entityRestriction.collectionField,
                ) as RelationField
                const parentCollection = schema.collections[collectionField.collection]
                const currentMap = collectionPermissions.parentPropertyEntities
                const previousMap = prevCollectionPermissions?.parentPropertyEntities || {}
                for (const [prop, currentList] of Object.entries(currentMap)) {
                    /* eslint-disable-next-line security/detect-object-injection */
                    const previousList = previousMap[prop] || []
                    const toCheck = originalPermissions
                        ? currentList.filter((id) => !previousList.includes(id))
                        : currentList
                    for (const parentPropertyEntity of toCheck) {
                        if (batchSize) batchSize.size++
                        if (batchSize && batchSize.size > 500) {
                            throw new Error(
                                `VALIDATION_ERROR: The number of operations in the Firestore transaction has exceeded the limit of 500. This is likely due to a large number of unique field checks or entity restrictions (in permissions when dealing with user collections).`,
                            )
                        }
                        tasks.push(async () => {
                            const access = await getRecordAccess(
                                transaction,
                                parentCollection,
                                parentPropertyEntity,
                                userId,
                                currentUserPermissions,
                            )
                            if (!access) {
                                throw new Error("PERMISSION_DENIED")
                            }
                        })
                    }
                }
            }
            await runWithConcurrencyLimit(tasks, CONCURRENCY_LIMIT)
        }
    }
}

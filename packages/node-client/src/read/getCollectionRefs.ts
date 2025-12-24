import {
    AttributeRestriction,
    CollectionsSchema,
    EntityParentFilter,
    EntityRestriction,
    IndividualEntityParentFilter,
    IndividualEntityRestriction,
    ParentEntityParentFilter,
    ParentEntityRestriction,
    ParentPropertyEntityParentFilter,
    StokerPermissions,
} from "@stoker-platform/types"
import { getFirestorePathRef } from "../utils/getFirestorePathRef"
import { getFirestore, Query, WhereFilterOp } from "firebase-admin/firestore"
import { collectionAccess, getField, getRoleGroup, hasDependencyAccess } from "@stoker-platform/utils"
import { getCustomizationFile } from "../initializeStoker"
import {
    getEntityParentFilters,
    getEntityRestrictions,
    getAttributeRestrictions,
} from "@stoker-platform/utils/lib/src/access/getCollectionRestrictions"

export const getCollectionRefs = (
    tenantId: string,
    path: string[],
    schema: CollectionsSchema,
    userId?: string,
    permissions?: StokerPermissions,
): Query[] => {
    const db = getFirestore()
    const collectionName = path.at(-1)
    if (!collectionName) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collectionName]
    const { labels, fields, preloadCache } = collectionSchema
    const customization = getCustomizationFile(collectionName, schema)

    const ref = getFirestorePathRef(db, path, tenantId)

    if (!permissions) {
        return [ref]
    } else if (userId) {
        // eslint-disable-next-line security/detect-object-injection
        const collectionPermissions = permissions.collections?.[labels.collection]

        if (!permissions.Role) {
            throw new Error("PERMISSION_DENIED")
        }

        const fullCollectionAccess = collectionPermissions && collectionAccess("Read", collectionPermissions)
        const dependencyAccess = hasDependencyAccess(collectionSchema, schema, permissions)
        const hasAttributeRestrictions: AttributeRestriction[] = getAttributeRestrictions(collectionSchema, permissions)
        const hasEntityRestrictions: EntityRestriction[] = getEntityRestrictions(collectionSchema, permissions)
        const hasEntityParentFilters: { parentFilter: EntityParentFilter; parentRestriction: EntityRestriction }[] =
            getEntityParentFilters(collectionSchema, schema, permissions)

        const getQueries = (constraints: [string, WhereFilterOp, unknown][] = []) => {
            const queries = []
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const roleGroup = getRoleGroup(permissions.Role!, collectionSchema, schema)
            if (!roleGroup) {
                throw new Error("PERMISSION_DENIED")
            }
            if (fullCollectionAccess) {
                let query = db
                    .collection("tenants")
                    .doc(tenantId)
                    .collection("system_fields")
                    .doc(labels.collection)
                    .collection(`${labels.collection}-${roleGroup.key}`)
                    .where("Collection_Path_String", "==", path.join("/"))
                constraints.forEach((constraint: [string, WhereFilterOp, unknown]) => {
                    query = query.where(...constraint)
                })
                queries.push(query)
            } else if (dependencyAccess) {
                for (const field of dependencyAccess) {
                    let query = db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_fields")
                        .doc(labels.collection)
                        .collection(`${labels.collection}-${field.field}`)
                        .where("Collection_Path_String", "==", path.join("/"))
                    constraints.forEach((constraint: [string, WhereFilterOp, unknown]) => {
                        query = query.where(...constraint)
                    })
                    queries.push(query)
                }
            }
            return queries
        }

        const applicableAttributeRestrictions = hasAttributeRestrictions.filter((restriction) => {
            if ("operations" in restriction && restriction.operations) {
                return restriction.operations.includes("Read")
            }
            return true
        })

        if (
            applicableAttributeRestrictions.length === 0 &&
            hasEntityRestrictions.length === 0 &&
            hasEntityParentFilters.length === 0
        ) {
            return getQueries()
        }

        let disjunctions = 0
        const incrementDisjunctions = (value: number | undefined) => {
            if (!value) return
            if (disjunctions === 0) {
                disjunctions = value
            } else {
                disjunctions *= value
            }
        }
        if (applicableAttributeRestrictions.length > 0) {
            for (const attributeRestriction of applicableAttributeRestrictions) {
                if (attributeRestriction.operations)
                    if (attributeRestriction.type === "Record_Property") {
                        const propertyRole = attributeRestriction.roles.find(
                            (roleItem) => roleItem.role === permissions.Role,
                        )
                        if (!propertyRole) throw new Error("PERMISSION_DENIED")
                        incrementDisjunctions(propertyRole.values?.length)
                    }
            }
        }
        if (preloadCache?.roles.includes(permissions.Role)) {
            if (preloadCache.range) {
                incrementDisjunctions(preloadCache.range.fields.length)
            }
        }
        const statusField = customization.admin?.statusField
        if (statusField && !preloadCache?.roles.includes(permissions.Role)) {
            incrementDisjunctions(Math.max(statusField.active?.length || 0, statusField.archived?.length || 0))
        }
        const batchSize = disjunctions === 0 ? 30 : Math.max(1, Math.floor(30 / disjunctions))

        const constraints: [string, WhereFilterOp, unknown][] = []

        applicableAttributeRestrictions
            .filter((attributeRestriction) => attributeRestriction.type === "Record_Owner")
            .forEach(() => constraints.push(["Created_By", "==", userId]))

        applicableAttributeRestrictions
            .filter((attributeRestriction) => attributeRestriction.type === "Record_User")
            .forEach((attributeRestriction) => {
                if ("collectionField" in attributeRestriction) {
                    const field = getField(fields, attributeRestriction.collectionField)
                    constraints.push([`${field.name}_Array`, "array-contains", permissions.Doc_ID])
                }
            })

        applicableAttributeRestrictions
            .filter((attributeRestriction) => attributeRestriction.type === "Record_Property")
            .forEach((attributeRestriction) => {
                if ("propertyField" in attributeRestriction) {
                    const role = attributeRestriction.roles.find((role) => role.role === permissions.Role)
                    if (!role) throw new Error("PERMISSION_DENIED")
                    const propertyField = getField(fields, attributeRestriction.propertyField)
                    if (propertyField.type === "Array") {
                        constraints.push([`${propertyField.name}_Array`, "array-contains-any", role.values])
                    } else {
                        constraints.push([propertyField.name, "in", role.values])
                    }
                }
            })

        const individualEntityQueries: Query[] = []

        hasEntityRestrictions
            .filter((entityRestriction) => entityRestriction.type === "Individual")
            .forEach((entityRestriction) => {
                const individualEntities = collectionPermissions?.individualEntities
                const entityGroups = []
                if (individualEntities) {
                    const finalBatchSize = entityRestriction.singleQuery ? entityRestriction.singleQuery : batchSize
                    for (let i = 0; i < individualEntities.length; i += finalBatchSize) {
                        const group = individualEntities.slice(i, i + finalBatchSize)
                        entityGroups.push(group)
                    }
                    if (!entityRestriction.singleQuery) {
                        entityGroups.forEach((group) => {
                            individualEntityQueries.push(...getQueries(constraints.concat([["id", "in", group]])))
                        })
                    } else {
                        if (individualEntities.length > finalBatchSize) {
                            throw new Error(
                                `INPUT_ERROR: Individual entity restriction with singleQuery set to true must not have more than ${entityRestriction.singleQuery} entities`,
                            )
                        }
                        constraints.push(["id", "in", individualEntities])
                    }
                }
            })

        hasEntityParentFilters
            .filter((entityParentFilter) => entityParentFilter.parentFilter.type === "Individual")
            .forEach((entityParentFilter) => {
                const { parentFilter, parentRestriction } = entityParentFilter as {
                    parentFilter: IndividualEntityParentFilter
                    parentRestriction: IndividualEntityRestriction
                }
                if ("collectionField" in parentFilter) {
                    const field = getField(fields, parentFilter.collectionField)
                    if ("collection" in field) {
                        const parentPermissions = permissions.collections?.[field.collection]
                        if (!parentPermissions) throw new Error("PERMISSION_DENIED")
                        const individualEntities = parentPermissions.individualEntities
                        const entityGroups = []
                        if (individualEntities) {
                            const finalBatchSize = parentRestriction.singleQuery
                                ? parentRestriction.singleQuery
                                : batchSize
                            for (let i = 0; i < individualEntities.length; i += finalBatchSize) {
                                const group = individualEntities.slice(i, i + finalBatchSize)
                                entityGroups.push(group)
                            }
                            if (!parentRestriction.singleQuery) {
                                entityGroups.forEach((group) => {
                                    individualEntityQueries.push(
                                        ...getQueries(
                                            constraints.concat([[`${field.name}_Array`, "array-contains-any", group]]),
                                        ),
                                    )
                                })
                            } else {
                                if (individualEntities.length > finalBatchSize) {
                                    throw new Error(
                                        `INPUT_ERROR: Individual entity parentFilter with singleQuery set to true must not have more than ${parentRestriction.singleQuery} entities`,
                                    )
                                }
                                constraints.push([`${field.name}_Array`, "array-contains-any", individualEntities])
                            }
                        }
                    }
                }
            })

        const parentEntityQueries: Query[] = []

        hasEntityRestrictions
            .filter((entityRestriction) => entityRestriction.type === "Parent")
            .forEach((entityRestriction) => {
                if ("collectionField" in entityRestriction) {
                    const field = getField(fields, entityRestriction.collectionField)
                    if ("collection" in field) {
                        const batchEntities = collectionPermissions?.parentEntities
                        const entityGroups = []
                        if (batchEntities) {
                            const finalBatchSize = entityRestriction.singleQuery
                                ? entityRestriction.singleQuery
                                : batchSize
                            for (let i = 0; i < batchEntities.length; i += finalBatchSize) {
                                const group = batchEntities.slice(i, i + finalBatchSize)
                                entityGroups.push(group)
                            }
                            if (!entityRestriction.singleQuery) {
                                entityGroups.forEach((group) => {
                                    parentEntityQueries.push(
                                        ...getQueries(
                                            constraints.concat([[`${field.name}_Array`, "array-contains-any", group]]),
                                        ),
                                    )
                                })
                            } else {
                                if (batchEntities && batchEntities.length > finalBatchSize) {
                                    throw new Error(
                                        `INPUT_ERROR: Parent entity restriction with singleQuery set to true must not have more than ${entityRestriction.singleQuery} entities`,
                                    )
                                }
                                constraints.push([`${field.name}_Array`, "array-contains-any", batchEntities])
                            }
                        }
                    }
                }
            })

        hasEntityParentFilters
            .filter((entityParentFilter) => entityParentFilter.parentFilter.type === "Parent")
            .forEach((entityParentFilter) => {
                const { parentFilter, parentRestriction } = entityParentFilter as {
                    parentFilter: ParentEntityParentFilter
                    parentRestriction: ParentEntityRestriction
                }
                if ("collectionField" in parentFilter && "parentCollectionField" in parentFilter) {
                    const field = getField(fields, parentFilter.collectionField)
                    const parentCollectionField = getField(fields, parentFilter.parentCollectionField)
                    if ("collection" in field && "collection" in parentCollectionField) {
                        const parentPermissions = permissions.collections?.[field.collection]
                        if (!parentPermissions) throw new Error("PERMISSION_DENIED")
                        const batchEntities = parentPermissions.parentEntities
                        const entityGroups = []
                        if (batchEntities) {
                            const finalBatchSize = parentRestriction.singleQuery
                                ? parentRestriction.singleQuery
                                : batchSize
                            for (let i = 0; i < batchEntities.length; i += finalBatchSize) {
                                const group = batchEntities.slice(i, i + finalBatchSize)
                                entityGroups.push(group)
                            }
                            if (!parentRestriction.singleQuery) {
                                entityGroups.forEach((group) => {
                                    parentEntityQueries.push(
                                        ...getQueries(
                                            constraints.concat([
                                                [`${parentCollectionField.name}_Array`, "array-contains-any", group],
                                            ]),
                                        ),
                                    )
                                })
                            } else {
                                if (batchEntities && batchEntities.length > finalBatchSize) {
                                    throw new Error(
                                        `INPUT_ERROR: Profile_Parent entity parentFilter with singleQuery set to true must not have more than ${parentRestriction.singleQuery} entities`,
                                    )
                                }
                                constraints.push([
                                    `${parentCollectionField.name}_Array`,
                                    "array-contains-any",
                                    batchEntities,
                                ])
                            }
                        }
                    }
                }
            })

        const parentPropertyEntityQueries: Query[] = []

        if (parentEntityQueries.length === 0) {
            hasEntityRestrictions
                .filter((entityRestriction) => entityRestriction.type === "Parent_Property")
                .forEach((entityRestriction) => {
                    if ("collectionField" in entityRestriction && "propertyField" in entityRestriction) {
                        const collectionField = getField(fields, entityRestriction.collectionField)
                        const propertyField = getField(fields, entityRestriction.propertyField)
                        if ("collection" in collectionField) {
                            const batchEntities = collectionPermissions?.parentPropertyEntities || {}
                            Object.entries(batchEntities).forEach(([property, entityIds]) => {
                                if (entityIds.length > 0) {
                                    const entityGroups = []
                                    for (let i = 0; i < entityIds.length; i += batchSize) {
                                        const group = entityIds.slice(i, i + batchSize)
                                        entityGroups.push(group)
                                    }
                                    entityGroups.forEach((group) => {
                                        parentPropertyEntityQueries.push(
                                            ...getQueries(
                                                constraints.concat([
                                                    [`${collectionField.name}_Array`, "array-contains-any", group],
                                                    [propertyField.name, "==", property],
                                                ]),
                                            ),
                                        )
                                    })
                                }
                            })
                        }
                    }
                })

            hasEntityParentFilters
                .filter((entityParentFilter) => entityParentFilter.parentFilter.type === "Parent_Property")
                .forEach((entityParentFilter) => {
                    const { parentFilter } = entityParentFilter as { parentFilter: ParentPropertyEntityParentFilter }
                    if (
                        "collectionField" in parentFilter &&
                        "parentCollectionField" in parentFilter &&
                        "parentPropertyField" in parentFilter
                    ) {
                        const collectionField = getField(fields, parentFilter.collectionField)
                        const parentCollectionField = getField(fields, parentFilter.parentCollectionField)
                        const parentPropertyField = getField(fields, parentFilter.parentPropertyField)
                        if ("collection" in collectionField && "collection" in parentCollectionField) {
                            const parentPermissions = permissions.collections?.[collectionField.collection]
                            if (!parentPermissions) throw new Error("PERMISSION_DENIED")
                            const batchEntities = parentPermissions.parentPropertyEntities || {}
                            Object.entries(batchEntities).forEach(([property, entityIds]) => {
                                if (entityIds.length > 0) {
                                    const entityGroups = []
                                    for (let i = 0; i < entityIds.length; i += batchSize) {
                                        const group = entityIds.slice(i, i + batchSize)
                                        entityGroups.push(group)
                                    }
                                    entityGroups.forEach((group) => {
                                        parentPropertyEntityQueries.push(
                                            ...getQueries(
                                                constraints.concat([
                                                    [
                                                        `${parentCollectionField.name}_Array`,
                                                        "array-contains-any",
                                                        group,
                                                    ],
                                                    [parentPropertyField.name, "==", property],
                                                ]),
                                            ),
                                        )
                                    })
                                }
                            })
                        }
                    }
                })
        }

        const allQueries: Query[] = [...individualEntityQueries, ...parentEntityQueries, ...parentPropertyEntityQueries]
        if (!hasEntityRestrictions.length && !hasEntityParentFilters.length) return getQueries(constraints)

        return allQueries
    } else {
        throw new Error("PERMISSION_DENIED")
    }
}

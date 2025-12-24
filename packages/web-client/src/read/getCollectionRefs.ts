import {
    StokerPermissions,
    RoleGroup,
    AttributeRestriction,
    EntityRestriction,
    EntityParentFilter,
    IndividualEntityParentFilter,
    IndividualEntityRestriction,
    ParentEntityRestriction,
    ParentEntityParentFilter,
    ParentPropertyEntityParentFilter,
} from "@stoker-platform/types"
import { Query, QueryFieldFilterConstraint, collection, getFirestore, query, where } from "firebase/firestore"
import { getCollectionConfigModule, getCurrentUserPermissions, getSchema, getTenant } from "../initializeStoker"
import { collectionAccess, getField, hasDependencyAccess } from "@stoker-platform/utils"
import {
    getEntityParentFilters,
    getEntityRestrictions,
    getAttributeRestrictions,
} from "@stoker-platform/utils/lib/src/access/getCollectionRestrictions"

export const getCollectionRefs = (path: string[], roleGroup: RoleGroup, getAll?: boolean) => {
    const db = getFirestore()
    const tenantId = getTenant()
    const schema = getSchema()
    const permissions = getCurrentUserPermissions() as StokerPermissions
    const collectionName = path.at(-1)
    if (!collectionName) throw new Error("EMPTY_PATH")
    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collectionName]
    const { labels, fields, preloadCache } = collectionSchema
    const customization = getCollectionConfigModule(collectionName)
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

    const getQueries = (constraints: QueryFieldFilterConstraint[] = []): Query[] => {
        const queries = []
        if (fullCollectionAccess) {
            queries.push(
                query(
                    collection(
                        db,
                        "tenants",
                        tenantId,
                        "system_fields",
                        labels.collection,
                        `${labels.collection}-${roleGroup.key}`,
                    ),
                    where("Collection_Path_String", "==", path.join("/")),
                    ...constraints,
                ),
            )
        } else if (dependencyAccess) {
            for (const field of dependencyAccess) {
                queries.push(
                    query(
                        collection(
                            db,
                            "tenants",
                            tenantId,
                            "system_fields",
                            labels.collection,
                            `${labels.collection}-${field.field}`,
                        ),
                        where("Collection_Path_String", "==", path.join("/")),
                        ...constraints,
                    ),
                )
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
        getAll ||
        (applicableAttributeRestrictions.length === 0 &&
            hasEntityRestrictions.length === 0 &&
            hasEntityParentFilters.length === 0)
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
    if (applicableAttributeRestrictions) {
        for (const restriction of applicableAttributeRestrictions) {
            if (restriction.type === "Record_Property") {
                const propertyRole = restriction.roles.find((roleItem) => roleItem.role === permissions.Role)
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

    const constraints: QueryFieldFilterConstraint[] = []

    applicableAttributeRestrictions
        .filter((restriction) => restriction.type === "Record_Owner")
        .forEach(() => constraints.push(where("Created_By", "==", permissions.User_ID)))

    applicableAttributeRestrictions
        .filter((restriction) => restriction.type === "Record_User")
        .forEach((restriction) => {
            if ("collectionField" in restriction) {
                const field = getField(fields, restriction.collectionField)
                constraints.push(where(`${field.name}_Array`, "array-contains", permissions.Doc_ID))
            }
        })

    applicableAttributeRestrictions
        .filter((restriction) => restriction.type === "Record_Property")
        .forEach((restriction) => {
            if ("propertyField" in restriction) {
                const role = restriction.roles.find((role) => role.role === permissions.Role)
                if (!role) throw new Error("PERMISSION_DENIED")
                const propertyField = getField(fields, restriction.propertyField)
                if (propertyField.type === "Array") {
                    constraints.push(where(propertyField.name, "array-contains-any", role.values))
                } else {
                    constraints.push(where(propertyField.name, "in", role.values))
                }
            }
        })

    const individualEntityQueries: Query[] = []

    hasEntityRestrictions
        .filter((restriction) => restriction.type === "Individual")
        .forEach((restriction) => {
            const individualEntities = collectionPermissions?.individualEntities
            const entityGroups = []
            if (individualEntities) {
                const finalBatchSize = restriction.singleQuery ? restriction.singleQuery : batchSize
                for (let i = 0; i < individualEntities.length; i += finalBatchSize) {
                    const group = individualEntities.slice(i, i + finalBatchSize)
                    entityGroups.push(group)
                }
                if (!restriction.singleQuery) {
                    entityGroups.forEach((group) => {
                        individualEntityQueries.push(...getQueries(constraints.concat(where("id", "in", group))))
                    })
                } else {
                    if (individualEntities.length > finalBatchSize) {
                        throw new Error(
                            `INPUT_ERROR: Individual entity restriction with singleQuery set to true must not have more than ${restriction.singleQuery} entities`,
                        )
                    }
                    constraints.push(where("id", "in", individualEntities))
                }
            }
        })

    hasEntityParentFilters
        .filter((parentFilterItem) => parentFilterItem.parentFilter.type === "Individual")
        .forEach((parentFilterItem) => {
            const { parentFilter, parentRestriction } = parentFilterItem as {
                parentFilter: IndividualEntityParentFilter
                parentRestriction: IndividualEntityRestriction
            }
            if ("collectionField" in parentFilter) {
                const field = getField(fields, parentFilter.collectionField)
                if ("collection" in field) {
                    const parentPermissions = permissions.collections?.[field.collection]
                    if (!parentPermissions) throw new Error("PERMISSION_DENIED")
                    const individualEntities = parentPermissions?.individualEntities
                    const entityGroups = []
                    if (individualEntities) {
                        const finalBatchSize = parentRestriction.singleQuery ? parentRestriction.singleQuery : batchSize
                        for (let i = 0; i < individualEntities.length; i += finalBatchSize) {
                            const group = individualEntities.slice(i, i + finalBatchSize)
                            entityGroups.push(group)
                        }
                        if (!parentRestriction.singleQuery) {
                            entityGroups.forEach((group) => {
                                individualEntityQueries.push(
                                    ...getQueries(
                                        constraints.concat(where(`${field.name}_Array`, "array-contains-any", group)),
                                    ),
                                )
                            })
                        } else {
                            if (individualEntities.length > finalBatchSize) {
                                throw new Error(
                                    `INPUT_ERROR: Individual entity parentFilter with singleQuery set to true must not have more than ${parentRestriction.singleQuery} entities`,
                                )
                            }
                            constraints.push(where(`${field.name}_Array`, "array-contains-any", individualEntities))
                        }
                    }
                }
            }
        })

    const parentEntityQueries: Query[] = []

    hasEntityRestrictions
        .filter((restriction) => restriction.type === "Parent")
        .forEach((restriction) => {
            if ("collectionField" in restriction) {
                const field = getField(fields, restriction.collectionField)
                if ("collection" in field) {
                    const batchEntities = collectionPermissions?.parentEntities
                    const entityGroups = []
                    if (batchEntities) {
                        const finalBatchSize = restriction.singleQuery ? restriction.singleQuery : batchSize
                        for (let i = 0; i < batchEntities.length; i += finalBatchSize) {
                            const group = batchEntities.slice(i, i + finalBatchSize)
                            entityGroups.push(group)
                        }
                        if (!restriction.singleQuery) {
                            entityGroups.forEach((group) => {
                                parentEntityQueries.push(
                                    ...getQueries(
                                        constraints.concat(where(`${field.name}_Array`, "array-contains-any", group)),
                                    ),
                                )
                            })
                        } else {
                            if (batchEntities && batchEntities.length > finalBatchSize) {
                                throw new Error(
                                    `INPUT_ERROR: Parent entity restriction with singleQuery set to true must not have more than ${restriction.singleQuery} entities`,
                                )
                            }
                            constraints.push(where(`${field.name}_Array`, "array-contains-any", batchEntities))
                        }
                    }
                }
            }
        })

    hasEntityParentFilters
        .filter((parentFilterItem) => parentFilterItem.parentFilter.type === "Parent")
        .forEach((parentFilterItem) => {
            const { parentFilter, parentRestriction } = parentFilterItem as {
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
                        const finalBatchSize = parentRestriction.singleQuery ? parentRestriction.singleQuery : batchSize
                        for (let i = 0; i < batchEntities.length; i += finalBatchSize) {
                            const group = batchEntities.slice(i, i + finalBatchSize)
                            entityGroups.push(group)
                        }
                        if (!parentRestriction.singleQuery) {
                            entityGroups.forEach((group) => {
                                parentEntityQueries.push(
                                    ...getQueries(
                                        constraints.concat(
                                            where(`${parentCollectionField.name}_Array`, "array-contains-any", group),
                                        ),
                                    ),
                                )
                            })
                        } else {
                            if (batchEntities && batchEntities.length > finalBatchSize) {
                                throw new Error(
                                    `INPUT_ERROR: Parent entity parentFilter with singleQuery set to true must not have more than ${parentRestriction.singleQuery} entities`,
                                )
                            }
                            constraints.push(
                                where(`${parentCollectionField.name}_Array`, "array-contains-any", batchEntities),
                            )
                        }
                    }
                }
            }
        })

    const parentPropertyEntityQueries: Query[] = []

    if (parentEntityQueries.length === 0) {
        hasEntityRestrictions
            .filter((restriction) => restriction.type === "Parent_Property")
            .forEach((restriction) => {
                if ("collectionField" in restriction && "propertyField" in restriction) {
                    const collectionField = getField(fields, restriction.collectionField)
                    const propertyField = getField(fields, restriction.propertyField)
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
                                                where(`${collectionField.name}_Array`, "array-contains-any", group),
                                                where(propertyField.name, "==", property),
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
            .filter((parentFilterItem) => parentFilterItem.parentFilter.type === "Parent_Property")
            .forEach((parentFilterItem) => {
                const { parentFilter } = parentFilterItem as { parentFilter: ParentPropertyEntityParentFilter }
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
                                                where(
                                                    `${parentCollectionField.name}_Array`,
                                                    "array-contains-any",
                                                    group,
                                                ),
                                                where(parentPropertyField.name, "==", property),
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
}

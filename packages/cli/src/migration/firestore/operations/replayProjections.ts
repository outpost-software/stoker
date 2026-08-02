import {
    CollectionField,
    CollectionSchema,
    CollectionsSchema,
    RelationField,
    StokerRecord,
    StokerRole,
} from "@stoker-platform/types"
import { getFirestorePathRef, getStokerFirestore } from "@stoker-platform/node-client"
import {
    addDenormalized,
    getAllRoleGroups,
    getDependencyIndexFields,
    getFieldAccessGroupFields,
    getFieldAccessGroupIndexFields,
    getFieldAccessGroupKey,
    getRoleGroups,
    isDependencyField,
} from "@stoker-platform/utils"
import { FieldValue } from "firebase-admin/firestore"
import isEqual from "lodash/isEqual.js"

const getUniqueFieldNames = (collectionSchema: CollectionSchema) =>
    collectionSchema.fields
        .filter((field) => "unique" in field && field.unique)
        .map((field) => field.name)
        .sort()

const getDependencyIndexShape = (collectionSchema: CollectionSchema, schema: CollectionsSchema) => {
    const shape: Record<string, string[]> = {}
    for (const field of collectionSchema.fields) {
        if (isDependencyField(field, collectionSchema, schema)) {
            shape[field.name] = getDependencyIndexFields(field, collectionSchema, schema)
                .map((indexField) => indexField.name)
                .sort()
        }
    }
    return shape
}

const getRoleGroupShape = (collectionSchema: CollectionSchema, schema: CollectionsSchema) =>
    Array.from(getRoleGroups(collectionSchema, schema))
        .map((group) => ({
            key: group.key,
            roles: [...group.roles].sort(),
            fields: group.fields.map((field) => field.name).sort(),
        }))
        .sort((a, b) => a.key.localeCompare(b.key))

const getFieldAccessGroupFieldShape = (collectionSchema: CollectionSchema) => {
    const shape: Record<string, string[]> = {}
    for (const [groupKey, groupFields] of Object.entries(getFieldAccessGroupFields(collectionSchema))) {
        // eslint-disable-next-line security/detect-object-injection
        shape[groupKey] = groupFields.map((field) => field.name).sort()
    }
    return shape
}

const getProjectionKeys = (collectionSchema: CollectionSchema, schema: CollectionsSchema) => {
    const keys = new Set<string>()
    const roleGroups = getRoleGroups(collectionSchema, schema)
    for (const group of roleGroups) {
        keys.add(group.key)
    }
    const fieldAccessGroups = getFieldAccessGroupFields(collectionSchema)
    for (const [groupKey, groupFields] of Object.entries(fieldAccessGroups)) {
        if (groupFields.length === 0) continue
        for (const group of roleGroups) {
            const indexFields = getFieldAccessGroupIndexFields(groupKey, collectionSchema, group)
            if (indexFields.length === 0) continue
            const overlayKey = getFieldAccessGroupKey(groupKey, group.key)
            keys.add(overlayKey)
        }
    }
    for (const field of collectionSchema.fields) {
        if (isDependencyField(field, collectionSchema, schema)) {
            keys.add(field.name)
        }
    }
    return keys
}

const replayProjectionsForCollection = async (
    collection: string,
    currentSchema: CollectionsSchema,
    lastSchema: CollectionsSchema,
) => {
    console.log(`Projections for collection ${collection} have changed. Replaying...`)
    const db = getStokerFirestore()
    const bulkWriter = db.bulkWriter()

    bulkWriter.onWriteError((error) => {
        console.log(error)
        return true
    })

    // eslint-disable-next-line security/detect-object-injection
    const lastCollectionSchema = lastSchema.collections[collection]
    // eslint-disable-next-line security/detect-object-injection
    const currentCollectionSchema = currentSchema.collections[collection]
    const currentRoleGroups = getAllRoleGroups(currentSchema)

    const projectionKeys = new Set([
        ...getProjectionKeys(lastCollectionSchema, lastSchema),
        ...getProjectionKeys(currentCollectionSchema, currentSchema),
    ])
    const uniqueFieldNames = new Set([
        ...getUniqueFieldNames(lastCollectionSchema),
        ...getUniqueFieldNames(currentCollectionSchema),
    ])

    const tenants = await db.collection("tenants").listDocuments()
    for (const tenant of tenants) {
        for (const key of projectionKeys) {
            await db.recursiveDelete(
                tenant.collection("system_fields").doc(collection).collection(`${collection}-${key}`),
            )
        }
        for (const fieldName of uniqueFieldNames) {
            await db.recursiveDelete(
                tenant.collection("system_unique").doc(collection).collection(`Unique-${collection}-${fieldName}`),
            )
        }
    }

    const querySnapshot = await db.collectionGroup(collection).get()
    for (const doc of querySnapshot.docs) {
        const tenantId = doc.ref.path.split("/")[1]
        const record = { id: doc.id, ...doc.data() } as unknown as StokerRecord
        const path = record.Collection_Path as string[]
        if (!path) {
            continue
        }

        const dependencyRef = (field: CollectionField) =>
            db
                .collection("tenants")
                .doc(tenantId)
                .collection("system_fields")
                .doc(collection)
                .collection(`${collection}-${field.name}`)
                .doc(doc.id)
        const uniqueRef = (field: CollectionField, uniqueValue: string) =>
            db
                .collection("tenants")
                .doc(tenantId)
                .collection("system_unique")
                .doc(collection)
                .collection(`Unique-${collection}-${field.name}`)
                .doc(uniqueValue)
        const privateRef = (role: StokerRole) =>
            db
                .collection("tenants")
                .doc(tenantId)
                .collection("system_fields")
                .doc(collection)
                .collection(`${collection}-${role}`)
                .doc(doc.id)
        const twoWayIncludeRef = (relationPath: string[], id: string) => {
            const ref = getFirestorePathRef(db, relationPath, tenantId)
            return ref.doc(id)
        }
        const twoWayDependencyRef = (field: RelationField, dependencyField: string, id: string) =>
            db
                .collection("tenants")
                .doc(tenantId)
                .collection("system_fields")
                .doc(field.collection)
                .collection(`${field.collection}-${dependencyField}`)
                .doc(id)
        const twoWayPrivateRef = (field: RelationField, role: StokerRole, id: string) =>
            db
                .collection("tenants")
                .doc(tenantId)
                .collection("system_fields")
                .doc(field.collection)
                .collection(`${field.collection}-${role.replaceAll(" ", "-")}`)
                .doc(id)

        addDenormalized(
            "create",
            bulkWriter,
            path,
            doc.id,
            record,
            currentSchema,
            currentCollectionSchema,
            { noTwoWay: true },
            currentRoleGroups,
            FieldValue.arrayUnion,
            FieldValue.arrayRemove,
            FieldValue.delete,
            dependencyRef,
            uniqueRef,
            privateRef,
            twoWayIncludeRef,
            twoWayDependencyRef,
            twoWayPrivateRef,
        )
    }
    await bulkWriter.close()
}

export const replayProjections = async (currentSchema: CollectionsSchema, lastSchema: CollectionsSchema) => {
    const currentSchemaKeys = Object.keys(currentSchema.collections)

    for (const collection of currentSchemaKeys) {
        // eslint-disable-next-line security/detect-object-injection
        if (!lastSchema.collections[collection]) continue
        // eslint-disable-next-line security/detect-object-injection
        const lastCollectionSchema = lastSchema.collections[collection]
        // eslint-disable-next-line security/detect-object-injection
        const currentCollectionSchema = currentSchema.collections[collection]
        const roleGroupsChanged = !isEqual(
            getRoleGroupShape(lastCollectionSchema, lastSchema),
            getRoleGroupShape(currentCollectionSchema, currentSchema),
        )

        const fieldAccessGroupsChanged =
            !isEqual(lastCollectionSchema.fieldAccessGroups, currentCollectionSchema.fieldAccessGroups) ||
            !isEqual(
                getFieldAccessGroupFieldShape(lastCollectionSchema),
                getFieldAccessGroupFieldShape(currentCollectionSchema),
            )
        const uniqueFieldsChanged = !isEqual(
            getUniqueFieldNames(lastCollectionSchema),
            getUniqueFieldNames(currentCollectionSchema),
        )
        const dependenciesChanged = !isEqual(
            getDependencyIndexShape(lastCollectionSchema, lastSchema),
            getDependencyIndexShape(currentCollectionSchema, currentSchema),
        )
        if (roleGroupsChanged || fieldAccessGroupsChanged || uniqueFieldsChanged || dependenciesChanged) {
            await replayProjectionsForCollection(collection, currentSchema, lastSchema)
        }
    }
}

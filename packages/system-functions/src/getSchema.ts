import {
    fetchCurrentSchema,
    initializeStoker,
} from "@stoker-platform/node-client";
import {
    CollectionsSchema,
    DependencyField,
    RelationField,
    StokerPermissions,
} from "@stoker-platform/types";
import {collectionAccess,
    getAllRoleGroups,
    getDependencyIndexFields,
    getField,
    getUserRoleGroups,
    hasDependencyAccess,
    isRelationField,
} from "@stoker-platform/utils";
import {getFirestore} from "firebase-admin/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    CallableRequest,
    HttpsError,
} from "firebase-functions/v2/https";
import {join} from "node:path";

/* eslint-disable max-len */

export const getSchema = async (
    request: CallableRequest,
) => {
    const user = request.auth?.uid;
    const token = request.auth?.token;
    if (!user) {
        throw new HttpsError("unauthenticated", "User is not authenticated");
    }
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        throw new HttpsError(
            "permission-denied",
            "User does not have permission to access the schema",
        );
    }
    const tenantId = token?.tenant as string;

    const db = getFirestore();
    const permissionsSnapshot = await db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(user).get();
    if (!permissionsSnapshot.exists) {
        throw new HttpsError("permission-denied", "User does not have permission to access the schema");
    }
    const permissions = permissionsSnapshot.data() as StokerPermissions;
    if (!permissions.Role) {
        throw new HttpsError("permission-denied", "User does not have permission to access the schema");
    }

    let userSchema: CollectionsSchema;

    try {
        await initializeStoker(
            "production",
            tenantId,
            join(process.cwd(), "lib", "system-custom", "main.js"),
            join(process.cwd(), "lib", "system-custom", "collections"),
            true,
        );
        const schema = await fetchCurrentSchema(true);
        const schemaWithoutComputedFields = await fetchCurrentSchema(false);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const {collections: _, ...rest} = schema;
        userSchema = {collections: {}, ...rest};

        for (const collectionSchema of Object.values(schema.collections)) {
            const {labels, fields, access} = collectionSchema;
            const collectionPermissions = permissions.collections?.[labels.collection];
            const fullCollectionAccess = collectionPermissions && collectionAccess("Read", collectionPermissions);
            const dependencyAccess = hasDependencyAccess(collectionSchema, schema, permissions);
            const entityRestrictions = access.entityRestrictions;
            let hasDependentParentFilters = false;
            const hasDependentRelationFields = new Set<string>();
            if (entityRestrictions?.restrictions) {
                for (const childCollection of Object.values(schema.collections)) {
                    if (childCollection.access.entityRestrictions?.parentFilters) {
                        for (const parentFilter of childCollection.access.entityRestrictions.parentFilters) {
                            const collectionField = getField(childCollection.fields, parentFilter.collectionField) as RelationField;
                            if (collectionField?.collection === labels.collection) {
                                hasDependentParentFilters = true;
                            }
                        }
                    }
                }
            }
            for (const childCollection of Object.values(schema.collections)) {
                for (const field of childCollection.fields) {
                    if (isRelationField(field) && permissions.collections?.[childCollection.labels.collection] && (collectionAccess("Create", permissions.collections[childCollection.labels.collection]) || collectionAccess("Update", permissions.collections[childCollection.labels.collection])) && field.collection === labels.collection && (!field.access || field.access?.includes(permissions.Role))) {
                        field.includeFields?.forEach((includeField) => {
                            hasDependentRelationFields.add(includeField);
                        });
                    }
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const {fields: _, ...rest} = collectionSchema;

            if (fullCollectionAccess) {
                userSchema.collections[labels.collection] = {fields: [], ...rest};
                fields.forEach((field) => {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    if (!field.access || field.access?.includes(permissions.Role!)) {
                        userSchema.collections[labels.collection].fields.push(field);
                    }
                });
            } else if (dependencyAccess.length > 0 || hasDependentRelationFields.size > 0) {
                userSchema.collections[labels.collection] = {fields: [], ...rest};
                dependencyAccess.forEach((dependencyField: DependencyField) => {
                    const field = fields.find((field) => field.name === dependencyField.field);
                    if (field) {
                        if (!userSchema.collections[labels.collection].fields.some((userField) => userField.name === field.name)) {
                            userSchema.collections[labels.collection].fields.push(field);
                        }
                        const dependencyIndexFields = getDependencyIndexFields(field, collectionSchema, schema);
                        dependencyIndexFields.forEach((dependencyIndexField) => {
                            if (!userSchema.collections[labels.collection].fields.some((userField) => userField.name === dependencyIndexField.name)) {
                                userSchema.collections[labels.collection].fields.push(dependencyIndexField);
                            }
                        });
                    }
                });
                Array.from(hasDependentRelationFields).forEach((relationField) => {
                    const field = fields.find((field) => field.name === relationField);
                    if (field && !userSchema.collections[labels.collection].fields.some((userField) => userField.name === field.name)) {
                        userSchema.collections[labels.collection].fields.push(field);
                    }
                });
            } else if (hasDependentParentFilters) {
                userSchema.collections[labels.collection] = {fields: [], ...rest};
            }
        }

        const currentUserRoleGroups = getUserRoleGroups(schemaWithoutComputedFields, permissions, Object.keys(userSchema.collections));
        const allRoleGroups = getAllRoleGroups(schemaWithoutComputedFields, permissions, Object.keys(userSchema.collections));

        const serializedAllRoleGroups = Object.entries(allRoleGroups).map(
            ([collectionName, roleGroups]) => {
                return [collectionName, Array.from(roleGroups)];
            },
        );

        const data = {
            schema: userSchema,
            currentUserRoleGroups,
            allRoleGroups: Object.fromEntries(serializedAllRoleGroups),
        };

        return data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        errorLogger(error);
        throw new HttpsError("internal", "Failed to fetch schema");
    }
};

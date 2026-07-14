import {
    getOne,
    getStokerFirestore,
    initializeStoker,
    tryPromise,
} from "@stoker-platform/node-client";
import {
    CallableRequest,
    HttpsError,
} from "firebase-functions/v2/https";
import {algoliasearch} from "algoliasearch";
import {Assignable,
    AttributeRestriction,
    CollectionsSchema,
    EntityParentFilter,
    EntityRestriction,
    StokerPermissions,
} from "@stoker-platform/types";
import {join} from "path";
import {
    collectionAccess,
    getAttributeRestrictions,
    getEntityParentFilters,
    getEntityRestrictions,
    getField,
    hasDependencyAccess,
    isRelationField,
} from "@stoker-platform/utils";

/* eslint-disable max-len */

const sanitizeAlgoliaFilterValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        throw new HttpsError("invalid-argument", "Filter value cannot be null or undefined");
    }

    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new HttpsError("invalid-argument", "Filter value must be a finite number");
        }
        return String(value);
    }

    if (typeof value === "boolean") {
        return String(value);
    }

    if (typeof value === "string") {
        const escaped = value.replace(/"/g, "\"\"");
        return escaped;
    }

    throw new HttpsError("invalid-argument", "Filter value must be a string, number, or boolean");
};

const sanitizeAlgoliaFieldName = (fieldName: string): string => {
    if (typeof fieldName !== "string") {
        throw new HttpsError("invalid-argument", "Field name must be a string");
    }

    if (/[:()"']/.test(fieldName)) {
        throw new HttpsError("invalid-argument", "Field name contains invalid characters");
    }

    return fieldName;
};

export const searchResults = async (
    request: CallableRequest,
    schema: CollectionsSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    algoliaAdminKey: any,
) => {
    const user = request.auth?.uid;
    const token = request.auth?.token;
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        throw new HttpsError(
            "permission-denied",
            "User does not have permission to access this database",
        );
    }
    if (!user) {
        throw new HttpsError("unauthenticated", "User is not authenticated");
    }
    const tenantId = token?.tenant as string;

    const {collection, query, hitsPerPage, constraints, assigning} = request.data;

    if (!process.env.STOKER_ALGOLIA_ID) {
        throw new HttpsError("invalid-argument", "Algolia ID environment variable not set");
    }
    if (typeof collection !== "string") {
        throw new HttpsError("invalid-argument", "collection must be a string");
    }
    // eslint-disable-next-line security/detect-object-injection
    if (!schema.collections[collection]) {
        throw new HttpsError("invalid-argument", "Collection not found");
    }
    if (typeof hitsPerPage !== "number" || !Number.isFinite(hitsPerPage)) {
        throw new HttpsError("invalid-argument", "hitsPerPage must be a finite number");
    }
    const MAX_HITS_PER_PAGE = 500;
    const clampedHitsPerPage = Math.min(Math.max(Math.floor(hitsPerPage), 1), MAX_HITS_PER_PAGE);
    if (typeof query !== "string") {
        throw new HttpsError("invalid-argument", "query must be a string");
    }
    if (constraints && !Array.isArray(constraints)) {
        throw new HttpsError("invalid-argument", "constraints must be an array");
    }
    if (assigning && (typeof assigning !== "object" || typeof assigning.collection !== "string" || typeof assigning.id !== "string")) {
        throw new HttpsError("invalid-argument", "assigning must be an object with collection and id strings");
    }

    // eslint-disable-next-line security/detect-object-injection
    const collectionSchema = schema.collections[collection];
    const {fields} = collectionSchema;
    const db = getStokerFirestore();
    const permissionsSnapshot = await db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(user).get();
    const permissions = permissionsSnapshot.data() as StokerPermissions;
    if (!permissions?.Role) {
        throw new HttpsError("permission-denied", "User permissions not found");
    }

    // eslint-disable-next-line security/detect-object-injection
    const collectionPermissions = permissions.collections?.[collection];
    const fullCollectionAccess = collectionPermissions && collectionAccess("Read", collectionPermissions);
    const dependencyAccess = hasDependencyAccess(collectionSchema, schema, permissions);
    if (!fullCollectionAccess && !dependencyAccess) {
        throw new HttpsError("permission-denied", "User does not have permission to access search for this collection");
    }

    const hasAttributeRestrictions: AttributeRestriction[] = getAttributeRestrictions(collectionSchema, permissions);
    const hasEntityRestrictions: EntityRestriction[] = getEntityRestrictions(collectionSchema, permissions);
    const hasEntityParentFilters: {parentFilter: EntityParentFilter; parentRestriction: EntityRestriction}[] =
        getEntityParentFilters(collectionSchema, schema, permissions);

    let assignable: Assignable | undefined;
    let assignedArrayFilter: string | undefined;
    if (assigning) {
        // eslint-disable-next-line security/detect-object-injection
        const parentCollectionSchema = schema.collections[assigning.collection];
        if (!parentCollectionSchema) {
            throw new HttpsError("invalid-argument", "Assigning collection not found");
        }

        const {getCustomizationFile} = await initializeStoker(
            "production",
            tenantId,
            join(process.cwd(), "lib", "system-custom", "main.js"),
            join(process.cwd(), "lib", "system-custom", "collections"),
            true,
        );

        try {
            await getOne([assigning.collection], assigning.id, {userId: user});
        } catch {
            throw new HttpsError("permission-denied", "User does not have permission to access assigning parent");
        }

        const relationList = parentCollectionSchema.relationLists?.find((list) => list.collection === collection);
        if (relationList) {
            const customization = getCustomizationFile(assigning.collection, schema);
            const assignables = (await tryPromise(customization?.admin?.assignable)) as Assignable[] | undefined;
            assignable = assignables?.find((item) => item.collection === collection);
            if (assignable) {
                assignedArrayFilter = `${sanitizeAlgoliaFieldName(relationList.field)}_Array:"${sanitizeAlgoliaFilterValue(assigning.id)}"`;
            }
        }
    }

    const filters: string[] = [`tenant_id:${tenantId}`];

    if (constraints && constraints.length > 0) {
        constraints.forEach((constraint: [string, "==" | "in" | "array-contains", string[]]) => {
            const operator = constraint[1];
            let sanitizedFieldName = sanitizeAlgoliaFieldName(constraint[0]);
            const isArrayField = sanitizedFieldName.includes("_Array");
            if (isArrayField) {
                sanitizedFieldName = sanitizedFieldName.replace("_Array", "");
            }
            const field = getField(fields, sanitizedFieldName);
            if (!field) {
                throw new HttpsError("invalid-argument", `Field ${sanitizedFieldName} not found`);
            }

            if (operator === "array-contains") {
                if (isRelationField(field)) {
                    const sanitizedValue = sanitizeAlgoliaFilterValue(constraint[2]);
                    filters.push(`${sanitizedFieldName}_Array:"${sanitizedValue}"`);
                } else {
                    const sanitizedValue = sanitizeAlgoliaFilterValue(constraint[2]);
                    filters.push(`${sanitizedFieldName}:"${sanitizedValue}"`);
                }
            } else if (operator === "==") {
                const sanitizedValue = sanitizeAlgoliaFilterValue(constraint[2]);
                const valueFilter = typeof constraint[2] === "string" ?
                    `${sanitizedFieldName}:"${sanitizedValue}"` :
                    `${sanitizedFieldName}:${sanitizedValue}`;
                const includeValueInFilters = assignable?.includeValueInFilters?.find(
                    (include) => include.field === sanitizedFieldName && include.values.includes(constraint[2]),
                );
                const includesAssigned = !!assignedArrayFilter &&
                    !!assignable?.includeAssignedInFilters?.includes(sanitizedFieldName);
                const orFilters = [valueFilter];
                if (includeValueInFilters) {
                    const {includeValue} = includeValueInFilters;
                    const sanitizedIncludeValue = sanitizeAlgoliaFilterValue(includeValue);
                    orFilters.push(typeof includeValue === "string" ?
                        `${sanitizedFieldName}:"${sanitizedIncludeValue}"` :
                        `${sanitizedFieldName}:${sanitizedIncludeValue}`);
                }
                if (includesAssigned) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    orFilters.push(assignedArrayFilter!);
                }
                if (orFilters.length > 1) {
                    filters.push(`(${orFilters.join(" OR ")})`);
                } else {
                    filters.push(valueFilter);
                }
            } else if (operator === "in") {
                if (!Array.isArray(constraint[2])) {
                    throw new HttpsError("invalid-argument", "Filter \"in\" operator requires an array value");
                }
                const filter: string[] = [];
                constraint[2].forEach((value: unknown) => {
                    const sanitizedValue = sanitizeAlgoliaFilterValue(value);
                    if (typeof value === "string") {
                        filter.push(`${sanitizedFieldName}:"${sanitizedValue}"`);
                    } else {
                        filter.push(`${sanitizedFieldName}:${sanitizedValue}`);
                    }
                });
                filters.push(`(${filter.join(" OR ")})`);
            }
        });
    }

    if (hasEntityRestrictions.length > 0 || hasEntityParentFilters.length > 0) {
        throw new HttpsError("permission-denied", "User does not have permission to access search for this collection");
    }

    hasAttributeRestrictions
        .filter((restriction) => restriction.type === "Record_Owner")
        .forEach(() => filters.push(`Created_By:${permissions.User_ID}`));

    hasAttributeRestrictions
        .filter((restriction) => restriction.type === "Record_User")
        .forEach((restriction) => {
            if ("collectionField" in restriction) {
                const field = getField(fields, restriction.collectionField);
                filters.push(`${field.name}_Array:"${permissions.Doc_ID}"`);
            }
        });

    hasAttributeRestrictions
        .filter((restriction) => restriction.type === "Record_Property")
        .forEach((restriction) => {
            if ("propertyField" in restriction) {
                const role = restriction.roles.find((role) => role.role === permissions.Role);
                if (!role) throw new Error("PERMISSION_DENIED");
                const propertyField = getField(fields, restriction.propertyField);
                if (propertyField.type === "Array") {
                    const filter: string[] = [];
                    role.values?.forEach((value) => {
                        filter.push(`${propertyField.name}:"${value}"`);
                    });
                    filters.push(`(${filter.join(" OR ")})`);
                } else {
                    const filter: string[] = [];
                    role.values?.forEach((value) => {
                        filter.push(`${propertyField.name}:${value}`);
                    });
                    filters.push(`(${filter.join(" OR ")})`);
                }
            }
        });

    const client = algoliasearch(process.env.STOKER_ALGOLIA_ID, algoliaAdminKey.value());
    const searchResults = await client.searchSingleIndex({
        indexName: collection,
        searchParams: {query, hitsPerPage: clampedHitsPerPage, filters: filters.join(" AND ")},
    });

    return searchResults.hits.map((hit) => hit.objectID);
};

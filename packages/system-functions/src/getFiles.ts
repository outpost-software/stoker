import {CallableRequest, HttpsError} from "firebase-functions/v2/https";
import {getStorage} from "firebase-admin/storage";
import {getFirestore} from "firebase-admin/firestore";
import {
    CollectionsSchema,
    StokerPermissions,
    StokerRecord,
    StorageItem,
} from "@stoker-platform/types";
import {
    documentAccess,
    validateStorageName,
} from "@stoker-platform/utils";
import {getFirestorePathRef} from "@stoker-platform/node-client";
import {error as errorLogger} from "firebase-functions/logger";
import {getApp} from "firebase-admin/app";
import {
    validateStoragePath,
} from "./validateStoragePath.js";

/* eslint-disable max-len */

export const getFiles = async (
    request: CallableRequest,
    schema: CollectionsSchema,
) => {
    try {
        const user = request.auth?.uid;
        const token = request.auth?.token;
        if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
            throw new HttpsError(
                "permission-denied",
                "User does not have permission to access this database",
            );
        }
        const tenantId = token?.tenant as string;

        const path = request.data.path as string;
        const id = request.data.id as string;
        const collectionPath = request.data.collectionPath as string[];

        if (!user) {
            throw new HttpsError(
                "unauthenticated",
                "User is not authenticated",
            );
        }
        if (path) {
            const pathValidationError = validateStoragePath(path);
            if (pathValidationError) {
                throw new HttpsError(
                    "invalid-argument",
                    `Invalid path: ${pathValidationError}`,
                );
            }
        }
        if (typeof id !== "string") {
            throw new HttpsError("invalid-argument", "Invalid ID format");
        }
        const idValidationError = validateStorageName(id);
        if (idValidationError) {
            throw new HttpsError(
                "invalid-argument",
                `Invalid ID: ${idValidationError}`,
            );
        }
        if (!Array.isArray(collectionPath) ||
            collectionPath.some((pathItem) => {
                return typeof pathItem !== "string";
            })) {
            throw new HttpsError(
                "invalid-argument",
                "Invalid collection path format",
            );
        }
        for (const pathItem of collectionPath) {
            const validationError = validateStorageName(pathItem);
            if (validationError) {
                throw new HttpsError(
                    "invalid-argument",
                    `Invalid collection path item "${pathItem}": ${validationError}`,
                );
            }
        }

        const collection = collectionPath.at(-1);
        if (!collection) {
            throw new HttpsError(
                "invalid-argument",
                "Invalid collection path",
            );
        }
        // eslint-disable-next-line security/detect-object-injection
        const collectionSchema = schema.collections[collection];
        const db = getFirestore();
        const permissionsSnapshot =
            await db.collection("tenants").doc(tenantId).collection("system_user_permissions").doc(user).get();
        const permissions = permissionsSnapshot.data() as StokerPermissions;
        if (!permissions.Enabled) {
            throw new HttpsError(
                "permission-denied",
                "User account is disabled",
            );
        }
        const pathRef = getFirestorePathRef(db, collectionPath, tenantId);
        const recordSnapshot = await pathRef.doc(id).get();
        const record = recordSnapshot.data() as StokerRecord;
        const readAccess = documentAccess(
            "Read",
            collectionSchema,
            schema,
            user,
            permissions,
            record,
        );
        if (!readAccess) {
            errorLogger("User does not have permission to access this record");
            throw new HttpsError("internal", "Error getting files for role");
        }

        const userRole = permissions.Role;
        if (!userRole) {
            throw new HttpsError(
                "permission-denied",
                "User does not have a role",
            );
        }
        const app = getApp();
        const storage = getStorage();
        const bucket = storage.bucket(app.options.projectId);

        const basePath = `${tenantId}/${collectionPath.join("/")}/${id}`;
        const fullPath = path ? `${basePath}/${path}` : basePath;

        const [files, , response] = await bucket.getFiles({
            prefix: fullPath + "/",
            delimiter: "/",
        });

        const items: StorageItem[] = [];
        if (response && typeof response === "object" &&
            "prefixes" in response && Array.isArray(response.prefixes)) {
            for (const prefix of response.prefixes) {
                const relativePrefix = prefix.replace(fullPath + "/", "");
                const folderName = relativePrefix.replace("/", "");
                if (folderName) {
                    const placeholderPath = `${fullPath}/${folderName}/.placeholder`;
                    try {
                        const [metadata] = await bucket.file(placeholderPath).getMetadata();
                        const customMetadata = metadata.metadata || {};
                        const readRoles = typeof customMetadata.read === "string" ?
                            customMetadata.read.split(",") : [];
                        const updateRoles = typeof customMetadata.update === "string" ?
                            customMetadata.update.split(",") : [];
                        const deleteRoles = typeof customMetadata.delete === "string" ?
                            customMetadata.delete.split(",") : [];
                        const createdBy = typeof customMetadata.createdBy === "string" ?
                            customMetadata.createdBy : undefined;

                        if (user === createdBy || readRoles.includes(userRole)) {
                            items.push({
                                name: folderName,
                                fullPath: `${fullPath}/${folderName}`,
                                isFolder: true,
                                metadata: {
                                    read: readRoles,
                                    update: updateRoles,
                                    delete: deleteRoles,
                                    createdBy: createdBy,
                                },
                            });
                        }
                    } catch {
                        continue;
                    }
                }
            }
        }

        for (const file of files) {
            const relativePath = file.name.replace(fullPath + "/", "");
            const pathParts = relativePath.split("/");

            if (pathParts.length === 1) {
                if (pathParts[0] === ".placeholder") {
                    continue;
                }
                const [metadata] = await file.getMetadata();
                const customMetadata = metadata.metadata || {};
                const readRoles =
                    typeof customMetadata.read === "string" ?
                        customMetadata.read.split(",") : [];
                const updateRoles =
                    typeof customMetadata.update === "string" ?
                        customMetadata.update.split(",") : [];
                const deleteRoles =
                    typeof customMetadata.delete === "string" ?
                        customMetadata.delete.split(",") : [];
                const createdBy =
                    typeof customMetadata.createdBy === "string" ?
                        customMetadata.createdBy : undefined;

                if (user === createdBy || readRoles.includes(userRole)) {
                    items.push({
                        name: pathParts[0],
                        fullPath: file.name,
                        isFolder: false,
                        metadata: {
                            read: readRoles,
                            update: updateRoles,
                            delete: deleteRoles,
                            createdBy: createdBy,
                        },
                    });
                }
            }
        }

        items.sort((a, b) => {
            if (a.isFolder && !b.isFolder) return -1;
            if (!a.isFolder && b.isFolder) return 1;
            return a.name.localeCompare(b.name);
        });

        return {result: items};
    } catch (error) {
        errorLogger(error);
        throw new HttpsError("internal", "Error getting files for role");
    }
};

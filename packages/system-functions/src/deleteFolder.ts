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
import {Bucket} from "@google-cloud/storage";
import {
    validateStoragePath,
} from "./validateStoragePath.js";

/* eslint-disable max-len */

const getFilesForPath = async (
    path: string,
    basePath: string,
    bucket: Bucket,
) => {
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
                items.push({
                    name: folderName,
                    fullPath: `${fullPath}/${folderName}`,
                    isFolder: true,
                });
            }
        }
    }

    for (const file of files) {
        const relativePath = file.name.replace(fullPath + "/", "");
        const pathParts = relativePath.split("/");

        if (pathParts.length === 1) {
            items.push({
                name: pathParts[0],
                fullPath: file.name,
                isFolder: false,
            });
        }
    }

    return items;
};

const deleteFolderRecursively = async (
    folderPath: string,
    basePath: string,
    bucket: Bucket,
    role: string,
    user: string,
) => {
    const relativePath = folderPath.replace(`${basePath}/`, "");
    const folderItems = await getFilesForPath(relativePath, basePath, bucket);

    for (const item of folderItems) {
        if (item.isFolder) {
            await deleteFolderRecursively(item.fullPath, basePath, bucket, role, user);
        } else if (item.name !== ".placeholder") {
            const [metadata] = await bucket.file(item.fullPath).getMetadata();
            const customMetadata = metadata.metadata || {};
            const deleteRoles = typeof customMetadata.delete === "string" ?
                customMetadata.delete.split(",") : [];
            if (deleteRoles.includes(role) || deleteRoles.includes("*") || customMetadata.createdBy === user) {
                await bucket.file(item.fullPath).delete();
            } else {
                errorLogger("User does not have permission to delete this file");
                throw new HttpsError("internal", "Error deleting folder");
            }
        }
    }

    const placeholderPath = `${folderPath}/.placeholder`;
    await bucket.file(placeholderPath).delete();
};

export const deleteFolder = async (
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
        const folderName = request.data.folderName as string;

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
        if (typeof folderName !== "string") {
            throw new HttpsError("invalid-argument", "Invalid folder name format");
        }
        const folderNameValidationError = validateStorageName(folderName);
        if (folderNameValidationError) {
            throw new HttpsError(
                "invalid-argument",
                `Invalid folder name: ${folderNameValidationError}`,
            );
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
        if (!permissions.Role) {
            throw new HttpsError(
                "permission-denied",
                "User does not have a role",
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
            errorLogger("User does not have permission to read this record");
            throw new HttpsError("internal", "Error deleting folder");
        }

        const app = getApp();
        const storage = getStorage();
        const bucket = storage.bucket(app.options.projectId);

        const basePath = `${tenantId}/${collectionPath.join("/")}/${id}`;
        const folderPath = path ? `${basePath}/${path}/${folderName}` : `${basePath}/${folderName}`;

        const folderItems = await getFilesForPath(path || "", basePath, bucket);
        const folderExists = folderItems.some((item) => item.name === folderName && item.isFolder);

        if (!folderExists) {
            errorLogger("Folder does not exist");
            throw new HttpsError("internal", "Error deleting folder");
        }

        await deleteFolderRecursively(folderPath, basePath, bucket, permissions.Role, user);

        return;
    } catch (error) {
        errorLogger(error);
        throw new HttpsError("internal", "Error deleting folder");
    }
};

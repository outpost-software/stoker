import {
    initializeStoker,
    addRecord,
    updateRecord,
    deleteRecord,
} from "@stoker-platform/node-client";
import {
    StokerRecord,
} from "@stoker-platform/types";
import {CallableRequest, HttpsError} from "firebase-functions/v2/https";
import {join} from "path";
import {
    error as errorLogger,
    info,
} from "firebase-functions/logger";

/* eslint-disable max-len */

export const writeApi = async (
    request: CallableRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    secrets: Record<string, any> = {},
) => {
    const user = request.auth?.uid;
    const token = request.auth?.token;
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        throw new HttpsError(
            "permission-denied",
            "User does not have permission to access this database",
        );
    }
    const tenantId = token?.tenant as string;

    const secretValues: Record<string, string> = {};
    for (const [key, secret] of Object.entries(secrets)) {
        // eslint-disable-next-line security/detect-object-injection
        secretValues[key] = secret.value();
    }

    const operation = request.data.operation as string;
    const path = request.data.path as string[];
    const id = request.data.id as string;
    const record = request.data.record as StokerRecord;
    const userData = request.data.user;

    if (!user) {
        throw new HttpsError(
            "unauthenticated",
            "User is not authenticated",
        );
    }
    if (!["create", "update", "delete"].includes(operation)) {
        throw new HttpsError("invalid-argument", "Invalid operation");
    }
    if (!Array.isArray(path) || path.some((pathItem) => {
        return typeof pathItem !== "string";
    })) {
        throw new HttpsError("invalid-argument", "Invalid path format");
    }
    if (id && (typeof id !== "string")) {
        throw new HttpsError("invalid-argument", "Invalid ID format");
    }
    if (record && (typeof record !== "object")) {
        throw new HttpsError("invalid-argument", "Invalid record format");
    }
    if (userData) {
        if (typeof userData !== "object") {
            throw new HttpsError("invalid-argument", "Invalid user format");
        }
        if (operation === "update" && !userData.operation) {
            throw new HttpsError("invalid-argument", "User operation is required for update operation");
        }
        if (userData.operation && typeof userData.operation !== "string") {
            throw new HttpsError("invalid-argument", "Invalid user operation format");
        }
        if (operation === "create" && !userData.password) {
            throw new HttpsError("invalid-argument", "User password is required for create operation");
        }
        if (userData.password && typeof userData.password !== "string") {
            throw new HttpsError("invalid-argument", "Invalid user password format");
        }
        if (userData.permissions && typeof userData.permissions !== "object") {
            throw new HttpsError("invalid-argument", "Invalid user permissions format");
        }
    }

    if (operation === "create" && !record) {
        throw new HttpsError(
            "invalid-argument",
            "Record is required for create operation",
        );
    }
    if (operation === "update" && !record) {
        throw new HttpsError(
            "invalid-argument",
            "Record is required for update operation",
        );
    }
    if (operation === "update" && !id) {
        throw new HttpsError(
            "invalid-argument",
            "ID is required for update operation"
        );
    }
    if (operation === "delete" && !id) {
        throw new HttpsError(
            "invalid-argument",
            "ID is required for delete operation"
        );
    }

    await initializeStoker(
        "production",
        tenantId,
        join(process.cwd(), "lib", "system-custom", "main.js"),
        join(process.cwd(), "lib", "system-custom", "collections"),
        true,
    );

    try {
        if (operation === "create") {
            const result = await addRecord(
                path,
                record,
                userData,
                user,
                undefined,
                {secrets: secretValues, user},
                id,
            );
            return {result};
        }
        if (operation === "update") {
            const result = await updateRecord(
                path,
                id,
                record,
                userData,
                user,
                undefined,
                {secrets: secretValues, user},
            );
            return {result};
        }
        if (operation === "delete") {
            const result = await deleteRecord(
                path,
                id,
                user,
                undefined,
                {secrets: secretValues, user},
            );
            return {result};
        }
        return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        if (error.message.includes("VALIDATION_ERROR")) {
            throw new HttpsError(
                "failed-precondition",
                error.message
            );
        } else if (error.message.includes("PERMISSION_DENIED")) {
            errorLogger(error);
            throw new HttpsError(
                "permission-denied",
                "Error writing data"
            );
        } else if (error.message.includes("ROLLBACK_FAILED")) {
            errorLogger(error);
            info(operation);
            info(path);
            if (id) {
                info(id);
            }
            throw new HttpsError(
                "internal",
                "Error writing data"
            );
        } else {
            throw new HttpsError(
                "internal",
                "Error writing data"
            );
        }
    }
};

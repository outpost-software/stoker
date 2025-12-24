import {CallableRequest, HttpsError} from "firebase-functions/v2/https";
import {DocumentSnapshot, getFirestore} from "firebase-admin/firestore";
import {
    CollectionsSchema,
    StokerPermissions,
    WriteLogEntry,
} from "@stoker-platform/types";
import {getFirestorePathRef} from "@stoker-platform/node-client";
import {error as errorLogger} from "firebase-functions/logger";

/* eslint-disable max-len */

export const getWriteLog = async (
    request: CallableRequest,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

        const path = request.data.path as string[];
        const id = request.data.id as string;
        const log = request.data.log as string | undefined;

        if (!user) {
            throw new HttpsError(
                "unauthenticated",
                "User is not authenticated",
            );
        }
        if (!Array.isArray(path) ||
            path.some((pathItem) => {
                return typeof pathItem !== "string";
            })) {
            throw new HttpsError(
                "invalid-argument",
                "Invalid collection path format",
            );
        }

        const collection = path.at(-1);
        if (!collection) {
            throw new HttpsError(
                "invalid-argument",
                "Invalid collection path",
            );
        }

        if (log && typeof log !== "string") {
            throw new HttpsError(
                "invalid-argument",
                "Invalid log ID format",
            );
        }

        // eslint-disable-next-line security/detect-object-injection
        // const collectionSchema = schema.collections[collection];
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
        const pathRef = getFirestorePathRef(db, path, tenantId);
        if (log) {
            const logSnapshot = await pathRef.doc(id).collection("system_write_log").doc(log).get();
            const logData = logSnapshot.data() as WriteLogEntry;
            if (user !== logData.user) {
                throw new HttpsError(
                    "permission-denied",
                    "User does not have permission to access this write log",
                );
            }
            return {
                status: logData.status,
            };
        } else {
            const logsSnapshot = await pathRef.doc(id).collection("system_write_log").where("user", "==", user).get();
            return logsSnapshot.docs.map((doc: DocumentSnapshot) => {
                const logData = doc.data() as WriteLogEntry;
                return {
                    status: logData.status,
                };
            });
        }
    } catch (error) {
        errorLogger(error);
        throw new HttpsError("internal", "Error getting write log");
    }
};

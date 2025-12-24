import {
    initializeStoker,
    getOne,
    getSome,
    GetOneOptions,
    serializeTimestamps,
} from "@stoker-platform/node-client";
import {
    Cursor,
    GetSomeOptions,
} from "@stoker-platform/node-client/dist/types/read/getSome";
import {StokerRecord} from "@stoker-platform/types";
import {Timestamp} from "firebase-admin/firestore";
import {error as errorLogger} from "firebase-functions/logger";
import {
    CallableRequest,
    CallableResponse,
    HttpsError,
} from "firebase-functions/v2/https";
import {join} from "path";

/* eslint-disable max-len */

export const readApi = async (
    request: CallableRequest,
    response: CallableResponse | undefined,
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

    const path = request.data.path as string[];
    const id = request.data.id as string;

    if (!user) {
        throw new HttpsError("unauthenticated", "User is not authenticated");
    }
    if (!Array.isArray(path) || path.some((pathItem) => {
        return typeof pathItem !== "string";
    })) {
        throw new HttpsError("invalid-argument", "Invalid path format");
    }
    if (id && (typeof id !== "string")) {
        throw new HttpsError("invalid-argument", "Invalid ID format");
    }


    const options: GetOneOptions | GetSomeOptions = request.data.options || {};

    if (options) {
        if (typeof options !== "object") {
            throw new HttpsError("invalid-argument", "Options must be an object");
        }

        if (options.subcollections) {
            if (typeof options.subcollections !== "object") {
                throw new HttpsError("invalid-argument", "Invalid subcollections format");
            }

            if (options.subcollections.collections && !Array.isArray(options.subcollections.collections)) {
                throw new HttpsError("invalid-argument", "Invalid subcollections collections format");
            }

            if (typeof options.subcollections.depth !== "number") {
                throw new HttpsError("invalid-argument", "Invalid subcollections depth format");
            }

            if (options.subcollections.constraints) {
                if (!Array.isArray(options.subcollections.constraints)) {
                    throw new HttpsError("invalid-argument", "Invalid subcollections constraints format");
                }
                options.subcollections.constraints.forEach((constraint) => {
                    if (Array.isArray(constraint)) {
                        if (constraint.length !== 3) {
                            throw new HttpsError("invalid-argument", "Invalid subcollections constraint format");
                        }
                        if (typeof constraint[0] !== "string") {
                            throw new HttpsError("invalid-argument", "Invalid subcollections constraint field format");
                        }
                        if (typeof constraint[1] !== "string") {
                            throw new HttpsError("invalid-argument", "Invalid subcollections constraint operator format");
                        }
                        if (typeof constraint[2] !== "string" && typeof constraint[2] !== "number" && typeof constraint[2] !== "boolean" && !Array.isArray(constraint[2])) {
                            throw new HttpsError("invalid-argument", "Invalid subcollections constraint value format");
                        }
                    }
                });
            }

            if (options.subcollections.limit) {
                if (typeof options.subcollections.limit !== "object") {
                    throw new HttpsError("invalid-argument", "Invalid subcollections limit format");
                }

                if (typeof options.subcollections.limit.number !== "number") {
                    throw new HttpsError("invalid-argument", "Invalid subcollections limit number format");
                }

                if (typeof options.subcollections.limit.orderByField !== "string") {
                    throw new HttpsError("invalid-argument", "Invalid subcollections limit orderByField format");
                }

                if (!["asc", "desc"].includes(options.subcollections.limit.orderByDirection)) {
                    throw new HttpsError("invalid-argument", "Invalid subcollections limit orderByDirection format");
                }
            }
        }

        if (options.relations) {
            if (typeof options.relations !== "object") {
                throw new HttpsError("invalid-argument", "Invalid relations format");
            }

            if (options.relations.fields && !Array.isArray(options.relations.fields)) {
                throw new HttpsError("invalid-argument", "Invalid relations fields format");
            }

            if (typeof options.relations.depth !== "number") {
                throw new HttpsError("invalid-argument", "Invalid relations depth format");
            }
        }
    }


    const constraints = request.data.constraints;

    if (constraints) {
        if (!Array.isArray(constraints)) {
            throw new HttpsError("invalid-argument", "Invalid constraints format");
        }
        constraints.forEach((constraint) => {
            if (Array.isArray(constraint)) {
                if (constraint.length !== 3) {
                    throw new HttpsError("invalid-argument", "Invalid constraint format");
                }
                if (typeof constraint[0] !== "string") {
                    throw new HttpsError("invalid-argument", "Invalid constraint field format");
                }
                if (typeof constraint[1] !== "string") {
                    throw new HttpsError("invalid-argument", "Invalid constraint operator format");
                }
                if (typeof constraint[2] !== "string" && typeof constraint[2] !== "number" && typeof constraint[2] !== "boolean" && !Array.isArray(constraint[2])) {
                    throw new HttpsError("invalid-argument", "Invalid constraint value format");
                }
            }
        });
    }

    options.user = user;

    await initializeStoker(
        "production",
        tenantId,
        join(process.cwd(), "lib", "system-custom", "main.js"),
        join(process.cwd(), "lib", "system-custom", "collections"),
        true,
    );

    try {
        if (id) {
            const doc = await getOne(
                path,
                id,
                options,
            ).catch((error) => {
                errorLogger(error);
                throw new HttpsError("internal", "Error reading data");
            });

            serializeTimestamps(doc);
            return {result: doc};
        } else {
            const deserializedConstraints = constraints?.map(([field, operator, value]: [string, string, unknown]) => {
                if (value && typeof value === "string") {
                    const millis = Date.parse(value);
                    if (!isNaN(millis)) {
                        return [field, operator, Timestamp.fromMillis(millis)];
                    } else {
                        return [field, operator, value];
                    }
                } else {
                    return [field, operator, value];
                }
            });

            const getSomeOptions = options as GetSomeOptions;

            const getDocs = async (options: GetSomeOptions) => {
                const result = await getSome(
                    path,
                    deserializedConstraints,
                    options,
                ).catch((error) => {
                    errorLogger(error);
                    throw new HttpsError("internal", "Error reading data");
                });
                result.docs.forEach((doc) => {
                    serializeTimestamps(doc);
                });
                return result;
            };

            const docs: StokerRecord[] = [];

            const getChunk = async (startAfter?: Cursor) => {
                getSomeOptions.pagination = {
                    number: 500,
                    startAfter,
                };

                const chunk = await getDocs(getSomeOptions);

                docs.push(...chunk.docs);
                if (response) {
                    response.sendChunk({result: {docs: chunk.docs}});
                }

                if (chunk.docs.length === 500) {
                    await getChunk(chunk.cursor);
                    return;
                } else {
                    return;
                }
            };

            let result: {docs: StokerRecord[], pages: number};
            if (!getSomeOptions.pagination && request.data.stream) {
                await getChunk();
                return {result: {docs}};
            } else {
                result = await getDocs(getSomeOptions);
                return {result: {docs: result.docs}};
            }
        }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        errorLogger(error);
        throw new HttpsError("internal", "Error reading data");
    }
};

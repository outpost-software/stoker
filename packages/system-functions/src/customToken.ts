import {
    CallableRequest,
    HttpsError,
} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";

export const customToken = async (request: CallableRequest) => {
    const auth = getAuth();
    const user = request.auth?.uid;
    const token = request.auth?.token;
    if (!user) {
        throw new HttpsError("unauthenticated", "User is not authenticated");
    }
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        throw new HttpsError(
            "permission-denied",
            "User does not have permission to create a custom token",
        );
    }
    try {
        const customToken = await auth.createCustomToken(user, {
            tenant: token.tenant,
            collection: token.collection,
            role: token.role,
            doc: token.doc,
        });
        return {customToken};
    } catch {
        throw new HttpsError("internal", "Failed to create custom token");
    }
};

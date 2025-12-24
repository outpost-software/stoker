import {getAuth} from "firebase-admin/auth";
import {
    CallableRequest,
    HttpsError,
} from "firebase-functions/v2/https";

export const revokeMfa = async (request: CallableRequest) => {
    const userId = request.auth?.uid;
    const token = request.auth?.token;
    if (!userId) {
        throw new HttpsError("unauthenticated", "User not authenticated");
    }
    if (!(token?.tenant && token?.collection && token?.role && token?.doc)) {
        throw new HttpsError(
            "permission-denied",
            "User does not have permission to update MFA",
        );
    }
    const auth = getAuth();
    await auth.updateUser(userId, {
        multiFactor: {
            enrolledFactors: [],
        },
    });
    return {success: true};
};

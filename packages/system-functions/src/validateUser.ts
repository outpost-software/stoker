import {getAuth, UserRecord} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {error as errorLogger} from "firebase-functions/logger";

export const validateUser = async (
    user: UserRecord,
) => {
    return (async () => {
        const auth = getAuth();
        const db = getFirestore();

        const deleteUser = async (tenantId?: string) => {
            try {
                await auth.deleteUser(user.uid);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                if (error.code === "auth/user-not-found") {
                    return;
                }
                errorLogger(error);
            }

            if (!tenantId) {
                return;
            }
            try {
                await db
                    .collection("tenants")
                    .doc(tenantId)
                    .collection("system_user_permissions")
                    .doc(user.uid)
                    .delete();
            } catch (error: unknown) {
                errorLogger(error);
            }
            return;
        };

        await new Promise((resolve) => setTimeout(resolve, 30000));

        let latestUser: UserRecord | undefined;
        try {
            latestUser = await auth.getUser(user.uid);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if (error.code === "auth/user-not-found") {
                return;
            }
        }
        if (!latestUser) {
            return;
        }

        const claims = latestUser.customClaims;
        if (!claims?.tenant || !claims?.collection) {
            await deleteUser();
            return;
        }

        const permissionsSnapshot =
            await db
                .collection("tenants")
                .doc(claims.tenant)
                .collection("system_user_permissions")
                .doc(user.uid)
                .get();
        if (!permissionsSnapshot.exists) {
            await deleteUser();
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const permissions = permissionsSnapshot.data()!;

        const snapshot =
            await db
                .collection("tenants")
                .doc(claims.tenant)
                .collection(claims.collection)
                .doc(permissions.Doc_ID)
                .get();
        if (!snapshot.exists) {
            await deleteUser(claims.tenant);
            return;
        }
        return;
    })();
};

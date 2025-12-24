import { CollectionSchema, CollectionsSchema, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { getFieldCustomization, isDeleteSentinel, isValidUniqueFieldValue, tryPromise } from "@stoker-platform/utils"
import { getFirestore } from "firebase-admin/firestore"
import { getCustomizationFile } from "../initializeStoker"
export const uniqueValidation = async (
    operation: "create" | "update",
    tenantId: string,
    docId: string,
    data: StokerRecord,
    collectionSchema: CollectionSchema,
    schema: CollectionsSchema,
    user?: string,
    permissions?: StokerPermissions,
) => {
    const db = getFirestore()
    const customization = getCustomizationFile(collectionSchema.labels.collection, schema)

    const collectionName = collectionSchema.labels.collection

    const uniqueFields = collectionSchema.fields.filter((field) => "unique" in field && field.unique)

    const errors: string[] = []

    if (permissions && !permissions.Role) throw new Error("No role found in permissions")

    await Promise.all(
        uniqueFields.map(async (field) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (!user || !field.access || field.access.includes(permissions!.Role!)) {
                if (data[field.name] === undefined || isDeleteSentinel(data[field.name])) return
                const fieldCustomization = getFieldCustomization(field, customization)
                const allowField =
                    user && fieldCustomization?.custom?.serverAccess?.read !== undefined
                        ? await tryPromise(fieldCustomization.custom.serverAccess.read, [permissions?.Role, data])
                        : true
                if (!allowField) throw new Error("PERMISSION_DENIED")
                const fieldName = data[field.name].toString().toLowerCase().replace(/\s/g, "---").replaceAll("/", "|||")
                if (!isValidUniqueFieldValue(fieldName)) {
                    errors.push(`${field.name} "${data[field.name]}" is invalid`)
                } else {
                    const uniqueDoc = await db
                        .collection("tenants")
                        .doc(tenantId)
                        .collection("system_unique")
                        .doc(collectionName)
                        .collection(`Unique-${collectionName}-${field.name}`)
                        .doc(fieldName)
                        .get()

                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    if (uniqueDoc.exists && !(operation === "update" && uniqueDoc.data()!.id === docId)) {
                        errors.push(`${field.name} "${data[field.name]}" already exists`)
                    }
                }
            }
        }),
    )

    if (errors.length > 0) {
        throw new Error(errors.join(", "))
    }

    return
}

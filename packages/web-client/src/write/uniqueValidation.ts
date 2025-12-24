import { doc, getDoc, getFirestore } from "firebase/firestore"
import { CollectionSchema, StokerPermissions, StokerRecord } from "@stoker-platform/types"
import { isValidUniqueFieldValue, isDeleteSentinel } from "@stoker-platform/utils"
import { getTenant } from "../initializeStoker"

export const uniqueValidation = async (
    operation: "create" | "update",
    docId: string,
    data: StokerRecord,
    collectionSchema: CollectionSchema,
    permissions: StokerPermissions,
) => {
    const tenantId = getTenant()
    const db = getFirestore()
    const collectionName = collectionSchema.labels.collection

    const uniqueFields = collectionSchema.fields.filter((field) => "unique" in field && field.unique)

    const errors: string[] = []

    if (!permissions.Role) throw new Error("No role found in permissions")

    await Promise.all(
        uniqueFields.map(async (field) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            if (!field.access || field.access.includes(permissions.Role!)) {
                if (data[field.name] === undefined || isDeleteSentinel(data[field.name])) return
                const fieldName = data[field.name].toString().toLowerCase().replace(/\s/g, "---").replaceAll("/", "|||")
                if (!isValidUniqueFieldValue(fieldName)) {
                    errors.push(`${field.name} "${data[field.name]}" is invalid`)
                } else {
                    const uniqueDoc = await getDoc(
                        doc(
                            db,
                            "tenants",
                            tenantId,
                            "system_unique",
                            collectionName,
                            `Unique-${collectionName}-${field.name}`,
                            fieldName,
                        ),
                    ).catch(() => {})

                    if (uniqueDoc?.exists() && !(operation === "update" && uniqueDoc.data().id === docId)) {
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

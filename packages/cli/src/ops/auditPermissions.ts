import { fetchCurrentSchema, initializeStoker } from "@stoker-platform/node-client"
import { getFirestore } from "firebase-admin/firestore"
import { join } from "node:path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auditPermissions = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )
    const schema = await fetchCurrentSchema()
    const db = getFirestore()
    const dbMain = getFirestore()

    const mismatches = []
    const permissions = await db.collection("tenants").doc(options.tenant).collection("system_user_permissions").get()

    for (const authCollection of Object.values(schema.collections)) {
        if (authCollection.auth) {
            for (const doc of permissions.docs) {
                const permission = doc.data()
                if (permission.Collection !== authCollection.labels.collection) continue
                for (const collection of Object.values(schema.collections)) {
                    const { labels, access } = collection
                    if (access.auth) {
                        if (!access.auth.includes(permission.Role) && permission.collections[labels.collection]?.auth) {
                            mismatches.push(
                                `*** User ${doc.id} has excess auth permission for ${labels.collection} collection ***`,
                            )
                        }
                        if (access.auth.includes(permission.Role) && !permission.collections[labels.collection]?.auth) {
                            mismatches.push(
                                `User ${doc.id} is missing auth permission for ${labels.collection} collection`,
                            )
                        }
                    }
                    for (const operation of Object.entries(access.operations)) {
                        const [operationName, operationValue] = operation
                        if (operationName !== "assignable") {
                            const operationUpper = operationName.charAt(0).toUpperCase() + operationName.slice(1)
                            if (
                                operationValue.includes(permission.Role) &&
                                !permission.collections[labels.collection]?.operations?.includes(operationUpper)
                            ) {
                                mismatches.push(
                                    `User ${doc.id} is missing ${operationUpper} permission for ${labels.collection} collection`,
                                )
                            }
                        }
                    }
                    if (permission.collections[labels.collection]?.operations) {
                        for (const operation of permission.collections[labels.collection].operations) {
                            const accessOperation =
                                access.operations[operation.toLowerCase() as "read" | "create" | "update" | "delete"]
                            if (accessOperation && !accessOperation?.includes(permission.Role)) {
                                mismatches.push(
                                    `User ${doc.id} has excess ${operation} permission for ${labels.collection} collection`,
                                )
                            }
                        }
                    }
                    if (access.attributeRestrictions) {
                        for (const restriction of access.attributeRestrictions) {
                            for (const restrictionRole of restriction.roles) {
                                if (restrictionRole.role === permission.Role) {
                                    let assignmentType: "recordOwner" | "recordUser" | "recordProperty" | undefined =
                                        undefined
                                    if (restriction.type === "Record_Owner") {
                                        assignmentType = "recordOwner"
                                    } else if (restriction.type === "Record_User") {
                                        assignmentType = "recordUser"
                                    } else if (restriction.type === "Record_Property") {
                                        assignmentType = "recordProperty"
                                    }
                                    if (
                                        !restrictionRole.assignable &&
                                        assignmentType &&
                                        // eslint-disable-next-line security/detect-object-injection
                                        !permission.collections[labels.collection]?.[assignmentType]?.active
                                    ) {
                                        mismatches.push(
                                            `User ${doc.id} is missing ${restriction.type} attribute restriction for ${labels.collection} collection`,
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (access.entityRestrictions?.assignable?.includes(permission.Role)) continue

                    const hasEntityRestriction = access.entityRestrictions?.restrictions?.some((entityRestriction) =>
                        entityRestriction.roles.some((role) => role.role === permission.Role),
                    )

                    if (hasEntityRestriction && !permission.collections?.[labels.collection]?.restrictEntities) {
                        mismatches.push(
                            `User ${doc.id} is missing entity restriction for ${labels.collection} collection`,
                        )
                    }
                }
            }
        }
    }

    console.log(mismatches.join("\n\n"))

    if (options.email && mismatches.length > 0) {
        await dbMain.collection("system_mail").add({
            to: options.email,
            message: {
                subject: `Stoker Permissions Audit`,
                text: mismatches.join("\n\n"),
            },
        })
        console.log(`Email sent to ${options.email}`)
    }

    process.exit()
}

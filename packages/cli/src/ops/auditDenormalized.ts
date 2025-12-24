import { fetchCurrentSchema, initializeStoker } from "@stoker-platform/node-client"
import {
    getDependencyIndexFields,
    getLowercaseFields,
    getRoleGroups,
    getSingleFieldRelations,
    isDependencyField,
    isRelationField,
} from "@stoker-platform/utils"
import { join } from "node:path"
import isEqual from "lodash/isEqual.js"
import isEmpty from "lodash/isEmpty.js"
import { getFirestore } from "firebase-admin/firestore"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auditDenormalized = async (options: any) => {
    await initializeStoker(
        options.mode || "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )
    const schema = await fetchCurrentSchema()
    const db = getFirestore()

    for (const [collectionName, collectionSchema] of Object.entries(schema.collections)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const collectionData: Record<string, Record<string, any>> = {}
        console.log(`Loading ${collectionName}...`)
        const collectionSnapshot = await db.collectionGroup(collectionName).get()
        console.log(`Auditing ${collectionName}...`)
        collectionSnapshot.forEach((doc) => {
            collectionData[doc.id] = doc.data()
        })
        const singleFieldRelations = getSingleFieldRelations(collectionSchema, collectionSchema.fields)
        const singleFieldRelationNames = Array.from(singleFieldRelations).map((field) => field.name)
        for (const field of collectionSchema.fields) {
            if (isDependencyField(field, collectionSchema, schema)) {
                const dependencySnapshot = await db
                    .collection("system_fields")
                    .doc(collectionName)
                    .collection(`${collectionName}-${field.name}`)
                    .get()
                dependencySnapshot.forEach((dependency) => {
                    const dependencyData = dependency.data()
                    const indexFields = getDependencyIndexFields(field, collectionSchema, schema)
                    if (!indexFields.some((indexField) => indexField.name === field.name)) indexFields.push(field)
                    for (const indexField of indexFields) {
                        if (indexField.name === "Collection_Path_String") continue
                        if (isRelationField(indexField)) {
                            if (!getDependencyIndexFields(field, collectionSchema, schema).includes(indexField)) {
                                const dependencyValue = dependencyData[indexField.name]
                                const collectionValue = collectionData[dependency.id]?.[indexField.name]
                                if (!isEqual(dependencyValue, collectionValue)) {
                                    console.log(
                                        `${collectionName} ${dependency.id} ${field.name} Dependency: ${indexField.name} - ${JSON.stringify(dependencyValue)} !== ${JSON.stringify(collectionValue)}`,
                                    )
                                }
                            }
                            const dependencyValue = dependencyData[`${indexField.name}_Array`]
                            const collectionValue = collectionData[dependency.id]?.[`${indexField.name}_Array`]
                            if (
                                !(isEmpty(dependencyValue) && isEmpty(collectionValue)) &&
                                !isEqual(dependencyValue, collectionValue)
                            ) {
                                console.log(
                                    `${collectionName} ${dependency.id} ${field.name} Dependency: ${indexField.name} - ${JSON.stringify(dependencyValue)} !== ${JSON.stringify(collectionValue)}`,
                                )
                            }
                        } else {
                            const dependencyValue = dependencyData[indexField.name]
                            const collectionValue = collectionData[dependency.id]?.[indexField.name]
                            if (!isEqual(dependencyValue, collectionValue)) {
                                console.log(
                                    `${collectionName} ${dependency.id} ${field.name} Dependency: ${indexField.name} - ${JSON.stringify(dependencyValue)} !== ${JSON.stringify(collectionValue)}`,
                                )
                            }
                        }
                    }
                })
            }
        }
        const roleGroups = getRoleGroups(collectionSchema, schema)
        for (const roleGroup of roleGroups) {
            const dependencySnapshot = await db
                .collection("system_fields")
                .doc(collectionName)
                .collection(`${collectionName}-${roleGroup.key}`)
                .get()
            dependencySnapshot.forEach((dependency) => {
                const dependencyData = dependency.data()
                const lowercaseFields = getLowercaseFields(collectionSchema, roleGroup.fields)
                for (const indexField of roleGroup.fields) {
                    if (indexField.name === "Collection_Path_String") continue
                    if (isRelationField(indexField)) {
                        const dependencyValue = {
                            [indexField.name]: dependencyData[indexField.name],
                            [`${indexField.name}_Array`]: dependencyData[`${indexField.name}_Array`],
                        }
                        const collectionValue = {
                            [indexField.name]: collectionData[dependency.id]?.[indexField.name],
                            [`${indexField.name}_Array`]: collectionData[dependency.id]?.[`${indexField.name}_Array`],
                        }
                        if (singleFieldRelationNames.includes(indexField.name)) {
                            dependencyValue[`${indexField.name}_Single`] = dependencyData[`${indexField.name}_Single`]
                            collectionValue[`${indexField.name}_Single`] =
                                collectionData[dependency.id]?.[`${indexField.name}_Single`]
                        }
                        if (!isEqual(dependencyValue, collectionValue)) {
                            console.log(
                                `${collectionName} ${dependency.id} Private ${roleGroup.key}: ${indexField.name} - ${JSON.stringify(dependencyValue)} !== ${JSON.stringify(collectionValue)}`,
                            )
                        }
                    } else {
                        const dependencyValue = dependencyData[indexField.name]
                        const collectionValue = collectionData[dependency.id]?.[indexField.name]
                        if (!isEqual(dependencyValue, collectionValue)) {
                            console.log(
                                `${collectionName} ${dependency.id} Private ${roleGroup.key}: ${indexField.name} - ${JSON.stringify(dependencyValue)} !== ${JSON.stringify(collectionValue)}`,
                            )
                        }
                    }
                    if (
                        Array.from(lowercaseFields)
                            .map((field) => field.name)
                            .includes(indexField.name)
                    ) {
                        const dependencyValue = dependencyData[`${indexField.name}_Lowercase`]
                        const collectionValue = collectionData[dependency.id]?.[`${indexField.name}_Lowercase`]
                        if (!isEqual(dependencyValue, collectionValue)) {
                            console.log(
                                `${collectionName} ${dependency.id} Private ${roleGroup.key}: ${indexField.name}_Lowercase - ${JSON.stringify(dependencyValue)} !== ${JSON.stringify(collectionValue)}`,
                            )
                        }
                    }
                }
            })
        }
        console.log(`${collectionName} audited.\n`)
    }

    process.exit()
}

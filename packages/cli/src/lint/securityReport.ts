import { generateSchema } from "../deploy/schema/generateSchema.js"
import {
    getAccessFields,
    getField,
    getDependencyIndexFields,
    isDependencyField,
    isRelationField,
    getRoleGroups,
    getFieldCustomization,
} from "@stoker-platform/utils"
import { statSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { GlobalConfig } from "@stoker-platform/types"

/* eslint-disable security/detect-object-injection */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const securityReport = async () => {
    interface WriteRuleReads {
        main: Set<string>
        batch: Set<string>
    }

    const writeRuleReads: {
        [collection: string]: WriteRuleReads
    } = {}
    const roles: {
        [role: string]: {
            [collection: string]: {
                [field: string]: Set<string>
            }
        }
    } = {}
    let isError = false

    const schema = await generateSchema()
    const path = join(process.cwd(), "lib", "main.js")
    const url = pathToFileURL(path).href
    const globalConfigFile = await import(url)
    const globalConfig: GlobalConfig = globalConfigFile.default("node")

    for (const [collectionName, collectionSchema] of Object.entries(schema.collections)) {
        const { auth, fields, access } = collectionSchema
        const { serverWriteOnly } = access
        if (serverWriteOnly) continue

        writeRuleReads[collectionName] = {} as WriteRuleReads
        writeRuleReads[collectionName].main = new Set()
        writeRuleReads[collectionName].batch = new Set()

        writeRuleReads[collectionName].main.add("User Document Lookup")
        writeRuleReads[collectionName].main.add("Latest Deploy Document")
        writeRuleReads[collectionName].main.add("Maintenance Mode Document")
        writeRuleReads[collectionName].batch.add("User Document Lookup")
        writeRuleReads[collectionName].batch.add("Latest Deploy Document")
        writeRuleReads[collectionName].batch.add("Maintenance Mode Document")

        const roleGroups = getRoleGroups(collectionSchema, schema)
        roleGroups.forEach(() => {
            writeRuleReads[collectionName].batch.add("Main Document")
        })

        if (auth) {
            writeRuleReads[collectionName].main.add("Document Lock Lookup")
            writeRuleReads[collectionName].batch.add("Document Lock Lookup")
        }

        for (const field of fields) {
            if (isRelationField(field)) {
                if (field.enforceHierarchy) {
                    writeRuleReads[collectionName].batch.add(
                        `${field.name} ${field.enforceHierarchy.field} Hierarchy Document`,
                    )
                    writeRuleReads[collectionName].main.add(
                        `${field.name} ${field.enforceHierarchy.field} Hierarchy Document`,
                    )
                }
            }
            if ("unique" in field && field.unique) {
                writeRuleReads[collectionName].batch.add("Main Document")
                writeRuleReads[collectionName].batch.add(`${field.name} Main Unique Document Exists`)
                writeRuleReads[collectionName].batch.add(`${field.name} Main Unique Document Get`)
                writeRuleReads[collectionName].main.add(`${field.name} Main Unique Document Exists`)
                writeRuleReads[collectionName].main.add(`${field.name} Main Unique Document Get`)
            }
            if (isDependencyField(field, collectionSchema, schema)) {
                writeRuleReads[collectionName].batch.add("Main Document")
            }
        }
    }

    for (const role of globalConfig.roles) {
        roles[role] = {}
        for (const [collectionName, collectionSchema] of Object.entries(schema.collections)) {
            const { fields, access } = collectionSchema
            if (
                access.operations.assignable === true ||
                (typeof access.operations.assignable === "object" && access.operations.assignable.includes(role)) ||
                access.operations.read?.includes(role)
            ) {
                for (const field of fields) {
                    if (field.access) continue
                    const path = join(process.cwd(), "lib", "collections", `${collectionName}.js`)
                    const url = pathToFileURL(path).href
                    const customizationFile = await import(url)
                    const customization = customizationFile.default("node")
                    if (isRelationField(field)) {
                        const relationCollection = schema.collections[field.collection]
                        const relationAccess = relationCollection.access
                        if (
                            relationAccess.operations.assignable === true ||
                            (typeof relationAccess.operations.assignable === "object" &&
                                relationAccess.operations.assignable.includes(role)) ||
                            !relationAccess.operations.read?.includes(role)
                        ) {
                            if (field.dependencyFields) {
                                for (const dependencyField of field.dependencyFields) {
                                    if (dependencyField.roles.includes(role)) {
                                        roles[role][field.collection] ||= {}
                                        if (!roles[role][field.collection][dependencyField.field]) {
                                            roles[role][field.collection][dependencyField.field] = new Set()
                                        }
                                        roles[role][field.collection][dependencyField.field].add(
                                            `${collectionName}- Dependency`,
                                        )
                                        const dependencyCollection = schema.collections[field.collection]
                                        const dependencyFieldSchema = getField(
                                            dependencyCollection.fields,
                                            dependencyField.field,
                                        )
                                        const indexFields = getDependencyIndexFields(
                                            dependencyFieldSchema,
                                            dependencyCollection,
                                            schema,
                                        )
                                        for (const indexField of indexFields) {
                                            const fieldCustomization = getFieldCustomization(indexField, customization)
                                            roles[role][field.collection] ||= {}
                                            if (
                                                dependencyCollection.access.serverReadOnly?.includes(role) &&
                                                fieldCustomization?.custom?.serverAccess?.read !== undefined
                                            ) {
                                                if (!roles[role][field.collection][indexField.name]) {
                                                    roles[role][field.collection][indexField.name] = new Set()
                                                }
                                                roles[role][field.collection][indexField.name].add(
                                                    `${collectionName}- Dependency- Index- Check Server Read Function`,
                                                )
                                            } else {
                                                if (!roles[role][field.collection][indexField.name]) {
                                                    roles[role][field.collection][indexField.name] = new Set()
                                                }
                                                roles[role][field.collection][indexField.name].add(
                                                    `${collectionName}- Dependency- Index`,
                                                )
                                            }
                                        }
                                    }
                                }
                            }

                            if (field.includeFields) {
                                for (const includeField of field.includeFields) {
                                    roles[role][field.collection] ||= {}
                                    if (!roles[role][field.collection][includeField]) {
                                        roles[role][field.collection][includeField] = new Set()
                                    }
                                    if (field.preserve) {
                                        roles[role][field.collection][includeField].add(
                                            `${collectionName} "${field.name}" Relation- Include- Preserved`,
                                        )
                                    } else {
                                        roles[role][field.collection][includeField].add(
                                            `${collectionName} "${field.name}" Relation- Include`,
                                        )
                                    }
                                }
                            }

                            roles[role][field.collection] ||= {}
                            if (
                                !roles[role][field.collection][
                                    `${collectionName} "${field.name}" Relation${field.preserve ? "- Preserved" : ""}`
                                ]
                            ) {
                                roles[role][field.collection][
                                    `${collectionName} "${field.name}" Relation${field.preserve ? "- Preserved" : ""}`
                                ] = new Set()
                            }
                            const restrictCreate =
                                field.restrictCreate === true ||
                                (typeof field.restrictCreate === "object" && field.restrictCreate.includes(role))
                            const restrictUpdate =
                                field.restrictUpdate === true ||
                                (typeof field.restrictUpdate === "object" && field.restrictUpdate.includes(role))
                            if (
                                access.operations.assignable === true ||
                                (typeof access.operations.assignable === "object" &&
                                    access.operations.assignable.includes(role)) ||
                                access.operations.create?.includes(role) ||
                                access.operations.update?.includes(role)
                            ) {
                                if (restrictCreate && !restrictUpdate) {
                                    roles[role][field.collection][
                                        `${collectionName} "${field.name}" Relation${field.preserve ? "- Preserved" : ""}`
                                    ].add("Read & Update")
                                } else if (restrictUpdate && !restrictCreate) {
                                    roles[role][field.collection][
                                        `${collectionName} "${field.name}" Relation${field.preserve ? "- Preserved" : ""}`
                                    ].add("Read & Create")
                                } else if (!restrictCreate && !restrictUpdate) {
                                    roles[role][field.collection][
                                        `${collectionName} "${field.name}" Relation${field.preserve ? "- Preserved" : ""}`
                                    ].add("Read & Create & Update")
                                }
                            } else {
                                roles[role][field.collection][
                                    `${collectionName} "${field.name}" Relation${field.preserve ? "- Preserved" : ""}`
                                ].add("Read Only")
                            }
                        }
                    }
                }
            }
        }
    }

    console.log("Security Rule Write Reads:\n")

    for (const [collection, reads] of Object.entries(writeRuleReads)) {
        console.log(`${collection}:\n`)
        const main = Array.from(reads.main).length
        if (main >= 8) {
            console.log(`[WARN] Main: ${main}`)
        } else if (main >= 10) {
            console.log(`[ERROR] Main: ${main}`)
            isError = true
        } else {
            console.log(`Main: ${main}`)
        }
        const batch = Array.from(reads.batch).length
        if (batch >= 16) {
            console.log(`[WARN] Batch: ${Array.from(reads.batch).length}`)
        } else if (batch >= 20) {
            console.log(`[ERROR] Batch: ${batch}`)
            isError = true
        } else {
            console.log(`Batch: ${batch}`)
        }
        console.log("\n")
    }

    console.log("\n\nPossible Excess Permissions:\n")

    for (const [role, collections] of Object.entries(roles)) {
        console.log(`${role.toUpperCase()}\n`)
        for (const [collection, fields] of Object.entries(collections)) {
            console.log(
                `${collection}:\n${Object.entries(fields)
                    .map(([field, collections]) => `${field} (${Array.from(collections).join(", ")})`)
                    .join("\n")}`,
            )
            console.log("\n")
        }
        console.log("\n")
    }

    for (const collectionSchema of Object.values(schema.collections)) {
        const accessFields = [
            ...new Set(schema.config.roles.map((role) => getAccessFields(collectionSchema, role)).flat()),
        ]
        for (const accessField of accessFields) {
            if (!accessField.restrictUpdate && accessField.name !== "id" && accessField.name !== "Created_By") {
                console.error(
                    `Field ${accessField.name} in ${collectionSchema.labels.collection} is used to control access but does not have restrictUpdate set.`,
                )
                isError = true
            }
        }
    }

    const filePath = join(process.cwd(), "firebase-rules", "firestore.rules")
    const fileStats = statSync(filePath)
    const rulesetSize = fileStats.size / 1024
    if (rulesetSize > 256) {
        console.error(`[ERROR] Size of ruleset: ${rulesetSize.toFixed(2)} KB - Exceeds Maximum of 256 KB.`)
        isError = true
    } else if (rulesetSize > 200) {
        console.warn(`[WARN] Size of ruleset: ${rulesetSize.toFixed(2)} KB.`)
    } else {
        console.log(`Size of ruleset: ${rulesetSize.toFixed(2)} KB.`)
    }

    if (isError) {
        throw new Error("Security errors found in schema.")
    }
    console.log("\nNo security errors found in schema.")

    process.exit()
}

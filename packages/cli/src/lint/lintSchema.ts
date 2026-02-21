import {
    tryPromise,
    getCustomization,
    getField,
    getInverseRelationType,
    isDependencyField,
    isRelationField,
    systemFields,
    isIncludedField,
    getSystemFieldsSchema,
    getAccessFields,
    getDependencyIndexFields,
    isPaginationEnabled,
    roleHasOperationAccess,
    tryFunction,
    getFieldCustomization,
} from "@stoker-platform/utils"
import { generateSchema } from "../deploy/schema/generateSchema.js"
import {
    AccessFilesAssignmentRoles,
    CalendarConfig,
    CardsConfig,
    Chart,
    CollectionField,
    Filter,
    GlobalConfig,
    ImagesConfig,
    IndividualEntityRestriction,
    MapConfig,
    Metric,
    NumberField,
    ParentEntityRestriction,
    ParentPropertyEntityRestriction,
    RelationField,
    StringField,
    SystemField,
} from "@stoker-platform/types"
import { getCustomizationFiles } from "@stoker-platform/node-client"
import { join } from "path"
import { pathToFileURL } from "url"

export const lintSchema = async (noLog = false) => {
    const path = join(process.cwd(), "lib", "main.js")
    const url = pathToFileURL(path).href
    const globalConfigFile = await import(url)
    const globalConfig: GlobalConfig = globalConfigFile.default("node")
    const schema = await generateSchema(true)
    const customizationFiles = await getCustomizationFiles(
        join(process.cwd(), "lib", "collections"),
        Object.keys(schema.collections),
    )
    const customizationModules = getCustomization(Object.keys(schema.collections), customizationFiles, "node")

    const warnings = []
    const errors = []

    const roles = schema.config.roles
    const collectionNames = Object.keys(schema.collections)
    const collectionSchemas = Object.entries(schema.collections)
    const systemFieldSchema = getSystemFieldsSchema()

    const collectionNamesSet = new Set<string>()
    let authCollectionFound = false

    if (globalConfig.disabledCollections) {
        for (const collectionName of globalConfig.disabledCollections) {
            if (!collectionNames.includes(collectionName)) {
                errors.push(`Disabled collection ${collectionName} does not exist`)
            }
        }
    }

    const enableMultiFactorAuth = globalConfig.auth.enableMultiFactorAuth
    if (typeof enableMultiFactorAuth === "object") {
        enableMultiFactorAuth.forEach((role) => {
            if (!roles.includes(role)) {
                errors.push(`Multi-factor auth role ${role} does not exist`)
            }
        })
    }

    const writeLogIndexExemption = globalConfig.firebase?.writeLogIndexExemption
    if (writeLogIndexExemption) {
        for (const fieldName of writeLogIndexExemption) {
            if (!systemFields.includes(fieldName as SystemField)) {
                errors.push(`Invalid write log index exemption field: ${fieldName}. Must be a valid system field.`)
            }
        }
    }

    const preload = globalConfig.preload
    const async = await tryPromise(preload?.async)
    const sync = await tryPromise(preload?.sync)
    if (sync) {
        for (const collectionName of sync) {
            if (!collectionNames.includes(collectionName)) {
                errors.push(`Preload sync collection ${collectionName} does not exist`)
            }
        }
    }
    if (async) {
        for (const collectionName of async) {
            if (!collectionNames.includes(collectionName)) {
                errors.push(`Preload async collection ${collectionName} does not exist`)
            }
        }
    }

    const adminAccess = tryFunction(globalConfig.admin?.access)
    if (adminAccess) {
        for (const adminAccessRole of adminAccess) {
            if (!roles.includes(adminAccessRole)) {
                errors.push(`Admin app access has invalid role value ${adminAccessRole}`)
            }
        }
    }

    const dashboard = await tryPromise(globalConfig.admin?.dashboard)
    if (dashboard) {
        for (const dashboardItem of dashboard) {
            const collectionSchema = schema.collections[dashboardItem.collection]
            if (!collectionNames.includes(dashboardItem.collection)) {
                errors.push(`Dashboard has invalid collection value ${dashboardItem.collection}`)
            }
            if (dashboardItem.roles) {
                for (const role of dashboardItem.roles) {
                    if (!roles.includes(role)) {
                        errors.push(`Dashboard has invalid role value ${role}`)
                    }
                }
            }
            if (dashboardItem.kind === "metric") {
                if (
                    dashboardItem.type !== "count" &&
                    !collectionSchema.fields.map((field) => field.name).includes(dashboardItem.field)
                ) {
                    errors.push(`Dashboard has invalid field value ${dashboardItem.field}`)
                }
            } else if (dashboardItem.kind === "chart") {
                if (
                    !collectionSchema.fields
                        .concat(systemFieldSchema)
                        .map((field) => field.name)
                        .includes(dashboardItem.dateField)
                ) {
                    errors.push(`Dashboard has invalid date field value ${dashboardItem.dateField}`)
                }
                if (
                    dashboardItem.metricField1 &&
                    !collectionSchema.fields.map((field) => field.name).includes(dashboardItem.metricField1)
                ) {
                    errors.push(`Dashboard has invalid metric field value ${dashboardItem.metricField1}`)
                }
                if (
                    dashboardItem.metricField2 &&
                    !collectionSchema.fields.map((field) => field.name).includes(dashboardItem.metricField2)
                ) {
                    errors.push(`Dashboard has invalid metric field value ${dashboardItem.metricField2}`)
                }
            } else if (dashboardItem.kind === "reminder") {
                for (const column of dashboardItem.columns) {
                    if (!collectionSchema.fields.map((field) => field.name).includes(column)) {
                        errors.push(`Dashboard has invalid column value ${column}`)
                    }
                }
            }
        }
    }

    const homePage = await tryPromise(globalConfig.admin?.homePage)
    if (homePage) {
        for (const role of Object.keys(homePage)) {
            if (!roles.includes(role)) {
                errors.push(`Home page configuration has invalid role value ${role}`)
            }
            // eslint-disable-next-line security/detect-object-injection
            if (!collectionNames.includes(homePage[role])) {
                // eslint-disable-next-line security/detect-object-injection
                errors.push(`Home page configuration has invalid collection value ${homePage[role]} for role ${role}`)
            }
        }
    }

    for (const [collectionName, collectionSchema] of collectionSchemas) {
        const {
            auth,
            fields,
            access,
            ttl,
            parentCollection,
            recordTitleField,
            softDelete,
            roleSystemFields,
            preloadCache,
            relationLists,
            fullTextSearch,
            ai,
        } = collectionSchema

        // eslint-disable-next-line security/detect-object-injection
        const customization = customizationModules[collectionName]

        const readRoles = roles.filter((role) => roleHasOperationAccess(collectionSchema, role, "read"))

        const fieldNames = fields.map((field) => field.name)

        const regex = /^(?!\/)(?!.*\/)(?!\.$)(?!\.\.$)(?!__.*__)[^/\s]{1,1500}$/
        if (!regex.test(collectionName)) {
            errors.push(`Invalid collection name: ${collectionName}. Must be a valid Firestore collection ID.`)
        }

        if (collectionName.includes("?")) {
            errors.push(`Invalid collection name: ${collectionName}. Collection names cannot contain question marks.`)
        }

        const formattedCollectionName = collectionName.replace(/\s+/g, "").replace(/^\w/, (c) => c.toUpperCase())
        if (formattedCollectionName !== collectionName) {
            errors.push(
                `Invalid collection name: ${collectionName}. Collection names should not have spaces and should start with a capital letter.`,
            )
        }
        if (collectionName.includes("-")) {
            errors.push(
                `Invalid collection name: ${collectionName}. Collection names cannot have dashes. Use underscores instead.`,
            )
        }

        fieldNames.forEach((fieldName) => {
            const formattedFieldName = fieldName.replace(/\s+/g, "").replace(/^\w/, (c) => c.toUpperCase())
            if (formattedFieldName !== fieldName) {
                errors.push(
                    `Collection ${collectionName} has invalid field name: ${fieldName}. Field names should not have spaces and should start with a capital letter.`,
                )
            }
            if (fieldName.includes(".")) {
                errors.push(
                    `Collection ${collectionName} has invalid field name: ${fieldName}. Field names cannot contain periods.`,
                )
            }
            if (fieldName.endsWith("_Array") || fieldName.endsWith("_Single") || fieldName.endsWith("_Lowercase")) {
                errors.push(
                    `Collection ${collectionName} has invalid field name: ${fieldName}. Field names cannot end with _Array, _Single, or _Lowercase.`,
                )
            }
        })

        if (collectionNamesSet.has(collectionName)) {
            errors.push(`Duplicate collection name: ${collectionName}`)
        } else {
            collectionNamesSet.add(collectionName)
        }

        const fieldNamesSet = new Set<string>()
        fields.forEach((field) => {
            if (fieldNamesSet.has(field.name)) {
                errors.push(`Collection ${collectionName} has a duplicate field name: ${field.name}`)
            } else {
                fieldNamesSet.add(field.name)
            }
        })

        systemFields.forEach((field) => {
            if (fieldNames.includes(field)) {
                errors.push(`Collection ${collectionName} has a field with a reserved system field name: ${field}`)
            }
        })

        if (ttl) {
            const ttlField = getField(fields, ttl)
            if (!ttlField) {
                errors.push(`Collection ${collectionName} has a ttl field ${ttl} that does not exist`)
            } else if (!ttlField.required) {
                errors.push(`Collection ${collectionName} has a ttl field ${ttl} that is not required`)
            }
        }

        if (recordTitleField) {
            const recordTitleFieldSchema = getField(fields, recordTitleField)
            if (!recordTitleFieldSchema) {
                errors.push(`Collection ${collectionName} has a title field ${recordTitleField} that does not exist`)
            } else {
                if (recordTitleFieldSchema.type !== "String") {
                    errors.push(`Collection ${collectionName} record title field ${recordTitleField} must be a string`)
                }
                if (recordTitleFieldSchema.access) {
                    errors.push(
                        `Collection ${collectionName} has a title field ${recordTitleField} with access restrictions`,
                    )
                }
                if (!recordTitleFieldSchema.required) {
                    errors.push(
                        `Collection ${collectionName} has a title field ${recordTitleField} that is not a required field`,
                    )
                }
            }
        }

        if (auth) {
            authCollectionFound = true

            const nameField = fields.find((field) => field.name === "Name")
            if (!nameField || nameField.type !== "String" || !nameField.required) {
                errors.push(`Auth collection ${collectionName} must have a required string field named "Name"`)
            }
            const userIdField = fields.find((field) => field.name === "User_ID")
            if (!userIdField || userIdField.type !== "String") {
                errors.push(`Auth collection ${collectionName} must have a string field named "User_ID"`)
            }
            const enabledField = fields.find((field) => field.name === "Enabled")
            if (!enabledField || enabledField.type !== "Boolean" || !enabledField.required) {
                errors.push(`Auth collection ${collectionName} must have a required boolean field named "Enabled"`)
            }
            const roleField = fields.find((field) => field.name === "Role")
            if (!roleField || roleField.type !== "String" || !roleField.required || !roleField.values) {
                errors.push(
                    `Auth collection ${collectionName} must have a required string field named "Role" with a values property`,
                )
            } else {
                roleField.values.forEach((role) => {
                    if (!roles.includes(role)) {
                        errors.push(
                            `Auth collection ${collectionName} has a Role field with invalid role value ${role}`,
                        )
                    }
                })
            }
            const emailField = fields.find((field) => field.name === "Email")
            if (
                !emailField ||
                emailField.type !== "String" ||
                !emailField.email ||
                !emailField.unique ||
                !emailField.required
            ) {
                errors.push(`Auth collection ${collectionName} must have a required, unique string field named "Email"`)
            }

            if (parentCollection) {
                errors.push(`Auth collection ${collectionName} cannot have a parent collection`)
            }
        }

        if (parentCollection) {
            if (!collectionNames.includes(parentCollection)) {
                errors.push(
                    `Collection ${collectionName} has a parent collection ${parentCollection} that does not exist`,
                )
            }
        }
        if (roleSystemFields) {
            for (const field of roleSystemFields) {
                const systemField = field.field as SystemField
                if (!systemFields.includes(systemField)) {
                    errors.push(
                        `Collection ${collectionName} has an role system field assignment ${systemField} that does not exist`,
                    )
                }
                if (field.roles) {
                    for (const role of field.roles) {
                        if (!roles.includes(role)) {
                            errors.push(
                                `Collection ${collectionName} has an role system field assignment ${systemField} with role ${role} that does not exist`,
                            )
                        }
                    }
                }
            }
        }
        if (relationLists) {
            for (const relation of relationLists) {
                const relationCollection = schema.collections[relation.collection]
                if (!relationCollection) {
                    errors.push(
                        `Collection ${collectionName} has a relation list collection ${relation.collection} that does not exist`,
                    )
                } else {
                    const relationField = getField(relationCollection.fields, relation.field)
                    if (!relationCollection) {
                        errors.push(
                            `Collection ${collectionName} has a relation list collection ${relation.field} for collection ${relation.collection} that does not exist`,
                        )
                    } else {
                        if (!relationField) {
                            errors.push(
                                `Collection ${collectionName} has a relation list field ${relation.field} that does not exist in collection ${relation.collection}`,
                            )
                        } else {
                            if (relation.roles) {
                                for (const role of relation.roles) {
                                    if (!roles.includes(role)) {
                                        errors.push(
                                            `Collection ${collectionName} has a relation list field ${relation.field} for collection ${relation.collection} with role ${role} that does not exist`,
                                        )
                                    }
                                    if (relationField.access && !relationField.access.includes(role)) {
                                        errors.push(
                                            `Collection ${collectionName} has a relation list field ${relation.field} for collection ${relation.collection} with role ${role} that does not have access to the field`,
                                        )
                                    }
                                }
                            } else {
                                if (relationField.access) {
                                    errors.push(
                                        `Collection ${collectionName} has a relation list field ${relation.field} for collection ${relation.collection} with access restrictions`,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        if (preloadCache) {
            for (const role of preloadCache.roles) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has a preload cache role ${role} that does not exist`)
                }
            }
        }
        if (preloadCache?.range) {
            if (preloadCache.range.fields.length > 3) {
                errors.push(`Collection ${collectionName} cannot have more than three preload cache range fields`)
            }
            if (preloadCache.range.fields.length > 0) {
                const rangeField = getField(fields.concat(systemFieldSchema), preloadCache.range.fields[0])
                if (!rangeField) {
                    errors.push(
                        `Collection ${collectionName} has a preload cache with a range field ${preloadCache.range.fields[0]} that does not exist`,
                    )
                } else if (!rangeField.required) {
                    errors.push(
                        `The first preload cache field for collection ${collectionName} must be a required field`,
                    )
                }
            }
            preloadCache.range.fields.forEach((field) => {
                const rangeField = getField(fields.concat(systemFieldSchema), field)
                if (!rangeField) {
                    errors.push(
                        `Collection ${collectionName} has a preload cache with a range field ${field} that does not exist`,
                    )
                } else if (rangeField.access) {
                    preloadCache.roles.forEach((role) => {
                        if (!rangeField.access?.includes(role)) {
                            errors.push(
                                `Collection ${collectionName} has a preload cache range field ${field} that can't be accessed by role ${role}`,
                            )
                        }
                    })
                }
            })
        }

        if (softDelete) {
            const softDeleteField = fields.find((field) => field.name === softDelete.archivedField)
            const softDeleteTimestampField = fields.find((field) => field.name === softDelete.timestampField)
            if (!softDeleteField || softDeleteField.type !== "Boolean") {
                errors.push(
                    `Collection ${collectionName} has a soft delete archived field ${softDelete.archivedField} that does not exist or is not a boolean`,
                )
            }
            if (auth) {
                errors.push(`Auth collection ${collectionName} cannot have soft delete enabled`)
            }
            if (!softDeleteTimestampField || softDeleteTimestampField.type !== "Timestamp") {
                errors.push(
                    `Collection ${collectionName} has a soft delete archivedAt field ${softDelete.timestampField} that does not exist or is not a timestamp`,
                )
            }
            if (typeof softDelete.retentionPeriod !== "number") {
                errors.push(`Collection ${collectionName} has a soft delete retention period that is not a number`)
            }
            if (softDeleteField?.sorting) {
                errors.push(
                    `Collection ${collectionName} has a soft delete field ${softDelete.archivedField} with sorting enabled`,
                )
            }
            if (softDeleteTimestampField?.sorting) {
                errors.push(
                    `Collection ${collectionName} has a soft delete timestamp field ${softDelete.timestampField} with sorting enabled`,
                )
            }
            if (softDeleteField?.access) {
                errors.push(
                    `Collection ${collectionName} has a soft delete field ${softDelete.archivedField} with access restrictions`,
                )
            }
            if (softDeleteTimestampField?.access) {
                errors.push(
                    `Collection ${collectionName} has a soft delete timestamp field ${softDelete.timestampField} with access restrictions`,
                )
            }
        }

        if (fullTextSearch) {
            for (const field of fullTextSearch) {
                if (!fieldNames.includes(field)) {
                    errors.push(
                        `Collection ${collectionName} has a full text search field ${field} that does not exist`,
                    )
                } else {
                    const fieldSchema = getField(fields, field)
                    if (fieldSchema.access) {
                        errors.push(
                            `Collection ${collectionName} has a full text search field ${field} with access restrictions`,
                        )
                    }
                }
            }
            if (access.entityRestrictions) {
                for (const role of readRoles) {
                    if (!preloadCache?.roles.includes(role) && !access.serverReadOnly?.includes(role)) {
                        warnings.push(
                            `Full text search will not work for role ${role} for collection ${collectionName} because the role has entity restrictions set. This can be resolved by enabling the preload cache or server read only options for the role.`,
                        )
                    }
                }
            }
        }

        if (ai?.chat) {
            for (const role of ai.chat.roles) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has a chat role ${role} that does not exist`)
                }
            }
        }

        const statusField = await tryPromise(customization?.admin?.statusField)
        if (statusField) {
            const statusFieldSchema = getField(fields, statusField.field)
            if (!statusFieldSchema) {
                errors.push(`Collection ${collectionName} has a status field ${statusField.field} that does not exist`)
            } else if (
                !(
                    (statusFieldSchema.type === "Boolean" &&
                        statusField.active.length === 1 &&
                        statusField.active[0] === true &&
                        statusField.archived.length === 1 &&
                        statusField.archived[0] === false) ||
                    ((statusFieldSchema.type === "String" || statusFieldSchema.type === "Number") &&
                        (!statusField.active ||
                            statusField.active.every((value: string | number) =>
                                (statusFieldSchema.values as (string | number)[])?.includes(value),
                            )) &&
                        (!statusField.archived ||
                            statusField.archived.every((value: string | number) =>
                                (statusFieldSchema.values as (string | number)[])?.includes(value),
                            )))
                )
            ) {
                errors.push(
                    `Collection ${collectionName} has a status field ${statusField.field} with values that do not match the matching field's values`,
                )
            }
        }

        const defaultSort = (await tryPromise(customization?.admin?.defaultSort)) as
            | { field: string; direction: "asc" | "desc" }
            | undefined
        if (defaultSort) {
            if (!fieldNames.includes(defaultSort.field)) {
                errors.push(
                    `Collection ${collectionName} has a default sort field ${defaultSort.field} that does not exist`,
                )
            }
        }

        const breadcrumbs = (await tryPromise(customization?.admin?.breadcrumbs)) as string[] | undefined
        if (breadcrumbs) {
            for (const breadcrumb of breadcrumbs) {
                if (!fieldNames.includes(breadcrumb)) {
                    errors.push(`Collection ${collectionName} has a breadcrumb ${breadcrumb} that does not exist`)
                }
            }
        }

        const cards = (await tryPromise(customization?.admin?.cards)) as CardsConfig | undefined
        if (cards) {
            if (cards.statusField && !fieldNames.includes(cards.statusField)) {
                errors.push(
                    `Collection ${collectionName} has a cards status field ${cards.statusField} that does not exist`,
                )
            }
            if (!fieldNames.concat(systemFields).includes(cards.headerField)) {
                errors.push(
                    `Collection ${collectionName} has a cards header field ${cards.headerField} that does not exist`,
                )
            }
            for (const section of cards.sections) {
                for (const field of section.fields) {
                    if (!fieldNames.includes(field)) {
                        errors.push(
                            `Collection ${collectionName} has a cards section with a field ${field} that does not exist`,
                        )
                    }
                }
            }
            if (cards.footerField && !fieldNames.concat(systemFields).includes(cards.footerField)) {
                errors.push(
                    `Collection ${collectionName} has a cards footer field ${cards.footerField} that does not exist`,
                )
            }
            if (!(cards.statusField || statusField)) {
                errors.push(`Collection ${collectionName} has cards enabled but does not have a status field defined`)
            }
            for (const role of readRoles) {
                if (statusField && cards.statusField && !preloadCache?.roles.includes(role)) {
                    warnings.push(
                        `Collection ${collectionName} has a cards-level status field that will not work for role ${role} because preload cache is not enabled for that role`,
                    )
                }
            }
            const statusFieldSchema = getField(fields, statusField?.field || cards.statusField) as
                | StringField
                | NumberField
                | undefined
            if (cards.excludeValues) {
                for (const value of cards.excludeValues) {
                    if (
                        !statusFieldSchema?.values
                            ?.map((statusFieldValue) => statusFieldValue.toString())
                            .includes(value.toString())
                    ) {
                        errors.push(
                            `Collection ${collectionName} has a cards exclude value ${value} that does not exist in the status field`,
                        )
                    }
                }
            }
        }

        const images = (await tryPromise(customization?.admin?.images)) as ImagesConfig | undefined
        if (images) {
            if (!fieldNames.includes(images.imageField)) {
                errors.push(
                    `Collection ${collectionName} has an images image field ${images.imageField} that does not exist`,
                )
            }
        }

        const map = (await tryPromise(customization?.admin?.map)) as MapConfig | undefined
        if (map) {
            if (map.addressField && !fieldNames.includes(map.addressField)) {
                errors.push(
                    `Collection ${collectionName} has a map location field ${map.addressField} that does not exist`,
                )
            }
            if (map.coordinatesField && !fieldNames.includes(map.coordinatesField)) {
                errors.push(
                    `Collection ${collectionName} has a map coordinates field ${map.coordinatesField} that does not exist`,
                )
            }
            if (map.addressField && map.coordinatesField) {
                errors.push(`Collection ${collectionName} has both a map address field and a coordinates field`)
            }
        }

        const calendar = (await tryPromise(customization?.admin?.calendar)) as CalendarConfig | undefined
        if (calendar) {
            const startFieldSchema = getField(fields.concat(systemFieldSchema), calendar.startField)
            if (!startFieldSchema) {
                errors.push(
                    `Collection ${collectionName} has a calendar start field ${calendar.startField} that does not exist`,
                )
            } else {
                if (startFieldSchema.type !== "Timestamp") {
                    errors.push(
                        `Collection ${collectionName} has a calendar start field ${calendar.startField} that is not a Timestamp`,
                    )
                }
                if (!readRoles.every((role) => preloadCache?.roles.includes(role)) && !startFieldSchema.required) {
                    errors.push(
                        `Collection ${collectionName} calendar start field ${calendar.startField} must be a required field`,
                    )
                }
                if (calendar.unscheduled) {
                    if (startFieldSchema.type !== "Timestamp" || !startFieldSchema.nullable) {
                        errors.push(
                            `Collection ${collectionName} has the calendar unscheduled feature enabled but has a calendar start field ${calendar.startField} that is not nullable`,
                        )
                    }
                }
            }

            if (calendar.endField) {
                const endFieldSchema = getField(fields.concat(systemFieldSchema), calendar.endField)
                if (!endFieldSchema) {
                    errors.push(
                        `Collection ${collectionName} has a calendar end field ${calendar.endField} that does not exist`,
                    )
                } else if (endFieldSchema.type !== "Timestamp") {
                    errors.push(
                        `Collection ${collectionName} has a calendar end field ${calendar.endField} that is not a Timestamp`,
                    )
                }
            }

            if (calendar.allDayField) {
                const allDayFieldSchema = getField(fields, calendar.allDayField)
                if (!allDayFieldSchema) {
                    errors.push(
                        `Collection ${collectionName} has a calendar all day field ${calendar.allDayField} that does not exist`,
                    )
                } else if (allDayFieldSchema.type !== "Boolean") {
                    errors.push(
                        `Collection ${collectionName} has a calendar all day field ${calendar.allDayField} that is not a Boolean`,
                    )
                }
            }

            if (calendar.resourceField) {
                const resourceField = getField(fields, calendar.resourceField)
                if (!resourceField) {
                    errors.push(
                        `Collection ${collectionName} has a calendar resource field ${calendar.resourceField} that does not exist`,
                    )
                } else {
                    if (calendar.resourceTitleField) {
                        if (isRelationField(resourceField)) {
                            const relationCollection = schema.collections[resourceField.collection]
                            const titleField = getField(relationCollection.fields, calendar.resourceTitleField)
                            if (!titleField) {
                                errors.push(
                                    `Collection ${collectionName} has a calendar resource title field ${calendar.resourceTitleField} that does not exist`,
                                )
                            }
                        }
                    }
                }
                if (preloadCache?.range) {
                    const calendarCache = preloadCache.range.fields.find((field) => field === calendar.startField)
                    if (!calendarCache) {
                        warnings.push(
                            `Collection ${collectionName} has a calendar start field ${calendar.startField} that does not have a matching preload cache field.`,
                        )
                    }
                }
            }

            if (calendar.unscheduled) {
                if (!preloadCache?.roles.length) {
                    errors.push(
                        `Collection ${collectionName} uses the calendar unscheduled feature but does not have preload cache enabled`,
                    )
                } else {
                    if (calendar.unscheduled.roles) {
                        for (const role of calendar.unscheduled.roles) {
                            if (!preloadCache?.roles.includes(role)) {
                                errors.push(
                                    `Collection ${collectionName} has the calendar unscheduled feature enabled for role ${role} that does not also have the preload cache enabled`,
                                )
                            }
                        }
                    }
                }
            }
        }

        const restrictExport = (await tryPromise(customization?.admin?.restrictExport)) as string[] | undefined
        if (restrictExport) {
            for (const role of restrictExport) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has a restrict export role ${role} that does not exist`)
                }
            }
        }

        const metrics = (await tryPromise(customization?.admin?.metrics)) as (Metric | Chart)[] | undefined
        if (metrics) {
            for (const metric of metrics) {
                if (metric.type === "sum" || metric.type === "average") {
                    if (metric.field && !fieldNames.includes(metric.field)) {
                        errors.push(
                            `Collection ${collectionName} has a metrics field ${metric.field} that does not exist`,
                        )
                    }
                } else if (metric.type === "area") {
                    if (!fieldNames.concat(systemFieldSchema.map((field) => field.name)).includes(metric.dateField)) {
                        errors.push(
                            `Collection ${collectionName} has a chart date field ${metric.dateField} that does not exist`,
                        )
                    }
                    if (metric.metricField1 && !fieldNames.includes(metric.metricField1)) {
                        errors.push(
                            `Collection ${collectionName} has a chart metric field ${metric.metricField1} that does not exist`,
                        )
                    }
                    if (metric.metricField2 && !fieldNames.includes(metric.metricField2)) {
                        errors.push(
                            `Collection ${collectionName} has a chart metric field ${metric.metricField2} that does not exist`,
                        )
                    }
                }
                if (metric.roles) {
                    for (const role of metric.roles) {
                        if (!roles.includes(role)) {
                            errors.push(`Collection ${collectionName} has a metrics role ${role} that does not exist`)
                        }
                    }
                }
            }
        }

        const filters = (await tryPromise(customization?.admin?.filters)) as Filter[] | undefined
        if (filters) {
            for (const filter of filters) {
                if (filter.type === "status") continue
                const field = getField(fields.concat(systemFieldSchema), filter.field)
                if (!field) {
                    errors.push(`Collection ${collectionName} has a filter field ${filter.field} that does not exist`)
                } else {
                    if ("roles" in filter && filter.roles) {
                        for (const role of filter.roles) {
                            if (!roles.includes(role)) {
                                errors.push(
                                    `Collection ${collectionName} has a filter for field ${filter.field} that has an access role ${role} that does not exist`,
                                )
                            }
                            if (field.access && !field.access.includes(role)) {
                                errors.push(
                                    `Collection ${collectionName} has a filter for field ${filter.field} that has an access role ${role} that does not have access to the field`,
                                )
                            }
                        }
                    }
                    if (filter.type === "range" && field.type !== "Timestamp") {
                        errors.push(
                            `Collection ${collectionName} has a filter field ${filter.field} that is not a Timestamp`,
                        )
                    }
                    if (filter.type === "range" && readRoles.every((role) => preloadCache?.roles.includes(role))) {
                        warnings.push(
                            `Collection ${collectionName} does not require a range filter because preload cache has been enabled for all roles`,
                        )
                    } else if (filter.type === "range" && calendar) {
                        warnings.push(
                            `Collection ${collectionName} does not require a range filter because the calendar start field is automatically used as the range filter field`,
                        )
                    }
                    if (filter.type === "select" && !["Boolean", "String", "Number", "Array"].includes(field.type)) {
                        errors.push(
                            `Collection ${collectionName} has a filter field ${filter.field} that is not a valid type for a select filter`,
                        )
                    }
                    if (filter.type === "relation" && !isRelationField(field)) {
                        errors.push(
                            `Collection ${collectionName} has a filter field ${filter.field} that is not a valid type for a relation filter`,
                        )
                    }
                    if (filter.type === "relation" && isRelationField(field)) {
                        const relationCollection = schema.collections[field.collection]
                        if (!relationCollection.fullTextSearch) {
                            errors.push(
                                `Collection ${collectionName} has a relation filter for field ${filter.field} on collection ${field.collection} that does not have full text search enabled`,
                            )
                        }
                    }
                }
            }
        }
        const rangeFilters = filters?.filter((filter: Filter) => filter.type === "range")
        if (rangeFilters && rangeFilters.length > 1) {
            errors.push(`Collection ${collectionName} has more than one range filter`)
        }

        const {
            auth: authAccess,
            operations,
            attributeRestrictions,
            entityRestrictions,
            permissionWriteRestrictions,
            serverReadOnly,
            serverWriteOnly,
            files,
        } = access

        if (authAccess) {
            for (const role of authAccess) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has an auth role ${role} that does not exist`)
                }
            }
        }

        if (serverReadOnly) {
            for (const role of serverReadOnly) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has a server read only role ${role} that does not exist`)
                }
            }
        }
        if (preloadCache && serverReadOnly) {
            for (const role of roles) {
                if (preloadCache?.roles.includes(role) && serverReadOnly.includes(role)) {
                    errors.push(
                        `Collection ${collectionName} cannot have both preloadCache and serverReadOnly enabled for role ${role}`,
                    )
                }
            }
        }

        if (
            !(operations.assignable || operations.read || operations.create || operations.update || operations.delete)
        ) {
            errors.push(`Collection ${collectionName} has no access operations defined`)
        }
        if (typeof operations.assignable === "object") {
            for (const role of operations.assignable) {
                if (!roles.includes(role)) {
                    errors.push(
                        `Collection ${collectionName} has an assignable access role ${role} that does not exist`,
                    )
                }
            }
        }
        if (operations.read) {
            for (const role of operations.read) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has a read access role ${role} that does not exist`)
                }
            }
        }
        if (operations.create) {
            for (const role of operations.create) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has a create access role ${role} that does not exist`)
                }
            }
        }
        if (operations.update) {
            for (const role of operations.update) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has an update access role ${role} that does not exist`)
                }
            }
        }
        if (operations.delete) {
            for (const role of operations.delete) {
                if (!roles.includes(role)) {
                    errors.push(`Collection ${collectionName} has a delete access role ${role} that does not exist`)
                }
            }
            for (const role of operations.delete) {
                for (const field of fields) {
                    if (field.access && !field.access.includes(role)) {
                        warnings.push(
                            `Collection ${collectionName} can be deleted by role ${role}, who does not have access to field ${field.name}`,
                        )
                    }
                }
            }
        }

        if (entityRestrictions) {
            if (entityRestrictions.assignable) {
                for (const role of entityRestrictions.assignable) {
                    if (!roles.includes(role)) {
                        errors.push(
                            `Collection ${collectionName} has an entity restriction assignable role ${role} that does not exist`,
                        )
                    }
                }
            }
            if (entityRestrictions.restrictions) {
                const restrictions = entityRestrictions.restrictions
                for (const restriction of restrictions) {
                    if (!["Individual", "Parent", "Parent_Property"].includes(restriction.type)) {
                        errors.push(
                            `Collection ${collectionName} has an entity restriction ${restriction.type} with an invalid type ${restriction.type}`,
                        )
                    }
                    if ("roles" in restriction) {
                        for (const role of restriction.roles) {
                            if (!roles.includes(role.role)) {
                                errors.push(
                                    `Collection ${collectionName} has an entity restriction ${restriction.type} with role ${role.role} that does not exist`,
                                )
                            }
                        }
                    }
                    if (restriction.type === "Individual") {
                        if (collectionSchema.parentCollection) {
                            errors.push(
                                `Collection ${collectionName} has an individual entity restriction but is a subcollection`,
                            )
                        }
                    }
                    if (restriction.type === "Parent" || restriction.type === "Parent_Property") {
                        const collectionField = getField(fields, restriction.collectionField) as RelationField
                        if (!collectionField || !isRelationField(collectionField)) {
                            errors.push(
                                `Collection ${collectionName} has an entity restriction ${restriction.type} with collection field ${restriction.collectionField} that does not exist or is not a relation field`,
                            )
                        } else if (collectionField.restrictUpdate !== true) {
                            warnings.push(
                                `Collection ${collectionName} has an entity restriction ${restriction.type} with collection field ${restriction.collectionField} that does not have restrictUpdate set to true`,
                            )
                        }
                        const relationCollection = schema.collections[collectionField.collection]
                        if (relationCollection.parentCollection) {
                            errors.push(
                                `Collection ${collectionName} has an entity restriction ${restriction.type} with collection field ${restriction.collectionField} that is linked to a subcollection`,
                            )
                        }
                    }
                    if (restriction.type === "Parent_Property") {
                        const propertyField = getField(fields, restriction.propertyField)
                        if (!propertyField) {
                            errors.push(
                                `Collection ${collectionName} has an entity restriction ${restriction.type} with property field ${restriction.propertyField} that does not exist`,
                            )
                        } else {
                            if (propertyField.restrictUpdate !== true) {
                                warnings.push(
                                    `Collection ${collectionName} has an entity restriction ${restriction.type} with property field ${restriction.propertyField} that does not have restrictUpdate set to true`,
                                )
                            }
                            if (propertyField.type === "Map" || propertyField.type === "Array") {
                                errors.push(
                                    `Collection ${collectionName} has an entity restriction ${restriction.type} with property field ${restriction.propertyField} of invalid type ${propertyField.type}`,
                                )
                            }
                            if (!("values" in propertyField && propertyField.values)) {
                                errors.push(
                                    `Collection ${collectionName} has an entity restriction ${restriction.type} with property field ${restriction.propertyField} that does not have values set`,
                                )
                            }
                        }
                    }
                }
                for (const stokerRole of roles) {
                    const roleRestrictions = restrictions.filter((item) =>
                        item.roles.some((role) => role.role === stokerRole),
                    )
                    const individual = roleRestrictions.filter((item) => item.type === "Individual")
                    const parent = roleRestrictions.filter((item) => item.type === "Parent")
                    const parentProperty = roleRestrictions.filter((item) => item.type === "Parent_Property")
                    if (individual.length > 1) {
                        errors.push(
                            `Collection ${collectionName} has more than one Individual entity restriction for role ${stokerRole}`,
                        )
                    }
                    if (parent.length > 1) {
                        errors.push(
                            `Collection ${collectionName} has more than one Parent entity restriction for role ${stokerRole}`,
                        )
                    }
                    if (parentProperty.length > 1) {
                        errors.push(
                            `Collection ${collectionName} has more than one Parent_Property entity restriction for role ${stokerRole}`,
                        )
                    }
                    if (parent.length && parentProperty.length) {
                        errors.push(
                            `Collection ${collectionName} has both Parent and Parent_Property entity restrictions for role ${stokerRole}`,
                        )
                    }
                    const singleQueryRestrictions = restrictions.filter(
                        (item) =>
                            (item.type === "Individual" || item.type === "Parent") &&
                            item.roles.some((role) => role.role === stokerRole) &&
                            item.singleQuery,
                    )
                    singleQueryRestrictions.forEach((item) => {
                        if (
                            preloadCache?.roles.some((role) => role === stokerRole) ||
                            serverReadOnly?.some((role) => role === stokerRole)
                        ) {
                            warnings.push(
                                `Collection ${collectionName} has the singleQuery option set for entity restriction ${item.type} for role ${stokerRole}. This is not recommended when using preload cache or server read only.`,
                            )
                        }
                    })
                    if (roleRestrictions.length > 1 && singleQueryRestrictions.length > 0) {
                        errors.push(
                            `Collection ${collectionName} has a combination of entity restrictions for role ${stokerRole} with ${singleQueryRestrictions.map((item) => item.type).join(" and ")} having the singleQuery option set`,
                        )
                    }
                    if (
                        roleRestrictions.length > 0 &&
                        attributeRestrictions?.find(
                            (item) =>
                                item.type === "Record_User" && item.roles.some((role) => role.role === stokerRole),
                        )
                    ) {
                        errors.push(
                            `Collection ${collectionName} cannot have both an entity restriction and a Record_User attribute restriction for role ${stokerRole}.`,
                        )
                    }
                }
                if (ai?.chat) {
                    for (const chatRole of ai.chat.roles) {
                        if (
                            entityRestrictions.assignable?.includes(chatRole) ||
                            restrictions.some((restriction) => restriction.roles.some((role) => role.role === chatRole))
                        ) {
                            errors.push(
                                `Collection ${collectionName} has AI chat enabled for role ${chatRole}, which also has entity restrictions.`,
                            )
                        }
                    }
                }
            }
            if (entityRestrictions.parentFilters) {
                const parentFilters = entityRestrictions.parentFilters
                const individual = parentFilters.filter((item) => item.type === "Individual")
                const parent = parentFilters.filter((item) => item.type === "Parent")
                const parentProperty = parentFilters.filter((item) => item.type === "Parent_Property")
                for (const parentFilterItem of parentFilters) {
                    if (!["Individual", "Parent", "Parent_Property"].includes(parentFilterItem.type)) {
                        errors.push(
                            `Collection ${collectionName} has a parent filter ${parentFilterItem.type} with an invalid type ${parentFilterItem.type}`,
                        )
                    }
                    if ("roles" in parentFilterItem) {
                        for (const role of parentFilterItem.roles) {
                            if (!roles.includes(role.role)) {
                                errors.push(
                                    `Collection ${collectionName} has a parent filter ${parentFilterItem.type} with role ${role.role} that does not exist`,
                                )
                            }
                        }
                    }
                    const collectionField = getField(fields, parentFilterItem.collectionField)
                    if (!collectionField || !isRelationField(collectionField)) {
                        errors.push(
                            `Collection ${collectionName} has a parent filter ${parentFilterItem.type} with collection field ${parentFilterItem.collectionField} that does not exist or is not a relation field`,
                        )
                    }
                    if (parentFilterItem.type === "Parent" || parentFilterItem.type === "Parent_Property") {
                        const parentCollectionField = getField(fields, parentFilterItem.parentCollectionField)
                        if (!parentCollectionField || !isRelationField(parentCollectionField)) {
                            errors.push(
                                `Collection ${collectionName} has a parent filter ${parentFilterItem.type} with parent collection field ${parentFilterItem.parentCollectionField} that does not exist or is not a relation field`,
                            )
                        } else if (parentCollectionField.restrictUpdate !== true) {
                            warnings.push(
                                `Collection ${collectionName} has a parent filter ${parentFilterItem.type} with parent collection field ${parentFilterItem.parentCollectionField} that does not have restrictUpdate set to true`,
                            )
                        }
                    }
                    if (parentFilterItem.type === "Parent_Property") {
                        const propertyField = getField(fields, parentFilterItem.parentPropertyField)
                        if (!propertyField) {
                            errors.push(
                                `Collection ${collectionName} has a parent filter ${parentFilterItem.type} with property field ${parentFilterItem.parentPropertyField} that does not exist`,
                            )
                        } else if (propertyField.restrictUpdate !== true) {
                            warnings.push(
                                `Collection ${collectionName} has a parent filter ${parentFilterItem.type} with property field ${parentFilterItem.parentPropertyField} that does not have restrictUpdate set to true`,
                            )
                            if (propertyField.type === "Map" || propertyField.type === "Array") {
                                errors.push(
                                    `Collection ${collectionName} has a parent filter ${parentFilterItem.type} with property field ${parentFilterItem.parentPropertyField} of invalid type ${propertyField.type}`,
                                )
                            }
                        }
                    }
                    if (individual.length && parent.length) {
                        const individualItem = individual[0]
                        const parentItem = parent[0]
                        if (individualItem.collectionField !== parentItem.collectionField) {
                            errors.push(
                                `Collection ${collectionName} has an Individual parent filter with collection field ${individualItem.collectionField} that does not match the Parent parent filter collection field ${parentItem.collectionField}`,
                            )
                        }
                    }
                    if (individual.length && parentProperty.length) {
                        const individualItem = individual[0]
                        const parentPropertyItem = parentProperty[0]
                        if (individualItem.collectionField !== parentPropertyItem.collectionField) {
                            errors.push(
                                `Collection ${collectionName} has an Individual parent filter with collection field ${individualItem.collectionField} that does not match the Parent_Property parent filter collection field ${parentPropertyItem.collectionField}`,
                            )
                        }
                    }
                }
                for (const stokerRole of roles) {
                    const roleParentFilters = parentFilters?.filter((item) =>
                        item.roles.some((role) => role.role === stokerRole),
                    )
                    const roleRestrictions = entityRestrictions.restrictions?.filter((item) =>
                        item.roles.some((role) => role.role === stokerRole),
                    )
                    if (roleRestrictions && roleRestrictions.length > 0 && roleParentFilters.length > 0) {
                        errors.push(
                            `Collection ${collectionName} cannot have both entity restrictions and parent filters for role ${stokerRole}`,
                        )
                    }
                    if (
                        roleParentFilters.length > 0 &&
                        attributeRestrictions?.find(
                            (item) =>
                                item.type === "Record_User" && item.roles.some((role) => role.role === stokerRole),
                        )
                    ) {
                        errors.push(
                            `Collection ${collectionName} cannot have both a parent filter and a Record_User attribute restriction for role ${stokerRole}.`,
                        )
                    }
                    const roleIndividual = roleParentFilters.filter((item) => item.type === "Individual")
                    const roleParent = roleParentFilters.filter((item) => item.type === "Parent")
                    const roleParentProperty = roleParentFilters.filter((item) => item.type === "Parent_Property")
                    if (roleIndividual.length > 1) {
                        errors.push(
                            `Collection ${collectionName} has more than one Individual parent filter for role ${stokerRole}`,
                        )
                    }
                    if (roleParent.length > 1) {
                        errors.push(
                            `Collection ${collectionName} has more than one Parent parent filter for role ${stokerRole}`,
                        )
                    }
                    if (roleParentProperty.length > 1) {
                        errors.push(
                            `Collection ${collectionName} has more than one Parent_Property parent filter for role ${stokerRole}`,
                        )
                    }
                    if (roleParent.length && roleParentProperty.length) {
                        errors.push(
                            `Collection ${collectionName} has both Parent and Parent_Property parent filters for role ${stokerRole}`,
                        )
                    }
                    for (const parentFilterItem of roleParentFilters) {
                        const parentField = getField(fields, parentFilterItem.collectionField)
                        if (parentField && isRelationField(parentField)) {
                            const parentCollection = schema.collections[parentField.collection]
                            const restriction = parentCollection.access.entityRestrictions?.restrictions?.find(
                                (restriction) =>
                                    restriction.type === parentFilterItem.type &&
                                    restriction.roles.some((role) => role.role === stokerRole),
                            ) as
                                | IndividualEntityRestriction
                                | ParentEntityRestriction
                                | ParentPropertyEntityRestriction
                                | undefined
                            if (!restriction) {
                                errors.push(
                                    `Collection ${collectionName} has a parent filter ${parentFilterItem.type} for role ${stokerRole} with collection field ${parentFilterItem.collectionField} that does not have a corresponding restriction`,
                                )
                            } else {
                                if (parentFilterItem.type === "Parent" || parentFilterItem.type === "Parent_Property") {
                                    const parentCollectionField = getField(
                                        fields,
                                        parentFilterItem.parentCollectionField,
                                    )
                                    const restrictionCollectionField = getField(
                                        parentCollection.fields,
                                        (restriction as ParentEntityRestriction | ParentPropertyEntityRestriction)
                                            .collectionField,
                                    )
                                    if (
                                        parentCollectionField &&
                                        restrictionCollectionField &&
                                        isRelationField(parentCollectionField) &&
                                        isRelationField(restrictionCollectionField) &&
                                        parentCollectionField.collection !== restrictionCollectionField.collection
                                    ) {
                                        errors.push(
                                            `Collection ${collectionName} has a parent filter ${parentFilterItem.type} for role ${stokerRole} with parent collection field with collection ${parentCollectionField.collection} that does not match the collection for ${parentFilterItem.type} restriction collection field ${(restriction as ParentEntityRestriction | ParentPropertyEntityRestriction).collectionField}`,
                                        )
                                    }
                                }
                                if (parentFilterItem.type === "Parent_Property") {
                                    if (
                                        parentFilterItem.parentPropertyField !==
                                        (restriction as ParentPropertyEntityRestriction).propertyField
                                    ) {
                                        errors.push(
                                            `Collection ${collectionName} has a parent filter for role ${stokerRole} with type ${parentFilterItem.type} and parent property field ${parentFilterItem.parentPropertyField} that does not match the ${parentFilterItem.type} restriction property field ${(restriction as ParentPropertyEntityRestriction).propertyField}`,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                if (ai?.chat) {
                    for (const chatRole of ai.chat.roles) {
                        if (
                            entityRestrictions.assignable?.includes(chatRole) ||
                            parentFilters.some((parentFilter) =>
                                parentFilter.roles.some((role) => role.role === chatRole),
                            )
                        ) {
                            errors.push(
                                `Collection ${collectionName} has AI chat enabled for role ${chatRole}, which also has entity parent filters.`,
                            )
                        }
                    }
                }
            }
        }
        if (attributeRestrictions) {
            for (const restriction of attributeRestrictions) {
                if (!["Record_User", "Record_Owner", "Record_Property"].includes(restriction.type)) {
                    errors.push(
                        `Collection ${collectionName} has an attribute restriction ${restriction.type} with an invalid type ${restriction.type}`,
                    )
                }
                if ("roles" in restriction) {
                    for (const role of restriction.roles) {
                        if (!roles.includes(role.role)) {
                            errors.push(
                                `Collection ${collectionName} has an attribute restriction ${restriction.type} with role ${role.role} that does not exist`,
                            )
                        }
                        if ("propertyField" in restriction && role.values) {
                            for (const value of role.values) {
                                const propertyField = fields.find((field) => field.name === restriction.propertyField)
                                if (
                                    propertyField &&
                                    propertyField.type !== "Number" &&
                                    propertyField.type !== "Timestamp" &&
                                    "values" in propertyField
                                ) {
                                    const values = propertyField?.values
                                    if (!values?.includes(value)) {
                                        errors.push(
                                            `Collection ${collectionName} has an attribute restriction ${restriction.type} with field value ${value} that does not exist`,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                if ("propertyField" in restriction) {
                    const propertyField = getField(fields, restriction.propertyField)
                    if (!propertyField) {
                        errors.push(
                            `Collection ${collectionName} has an attribute restriction ${restriction.type} with property field ${restriction.propertyField} that does not exist`,
                        )
                    } else {
                        if (!["String", "Array"].includes(propertyField.type)) {
                            errors.push(
                                `Collection ${collectionName} has an attribute restriction ${restriction.type} with property field ${restriction.propertyField} that is not a string or array`,
                            )
                        }
                        if ("values" in propertyField && propertyField.values && propertyField.values.length > 30) {
                            errors.push(
                                `Collection ${collectionName} has an attribute restriction ${restriction.type} with property field ${restriction.propertyField} that has more than 30 values`,
                            )
                        }
                    }
                }
                if ("collectionField" in restriction) {
                    const collectionField = getField(fields, restriction.collectionField)
                    if (!collectionField) {
                        errors.push(
                            `Collection ${collectionName} has an attribute restriction ${restriction.type} with collection field ${restriction.collectionField} that does not exist`,
                        )
                    } else if (!collectionField.restrictUpdate) {
                        warnings.push(
                            `Collection ${collectionName} has an attribute restriction ${restriction.type} with collection field ${restriction.collectionField} that does not have restrictUpdate set`,
                        )
                    }
                }
            }
        }
        if (ai?.chat) {
            for (const chatRole of ai.chat.roles) {
                if (
                    attributeRestrictions?.some((attributeRestriction) =>
                        attributeRestriction.roles.some((role) => role.role === chatRole),
                    )
                ) {
                    errors.push(
                        `Collection ${collectionName} has AI chat enabled for role ${chatRole}, which also has attribute restrictions.`,
                    )
                }
            }
        }
        if (permissionWriteRestrictions?.length) {
            for (const restriction of permissionWriteRestrictions) {
                if (!roles.includes(restriction.userRole)) {
                    errors.push(
                        `Collection ${collectionName} has an permission write restriction with user role ${restriction.userRole} that does not exist`,
                    )
                }
                if (!roles.includes(restriction.recordRole)) {
                    errors.push(
                        `Collection ${collectionName} has an permission write restriction with record role ${restriction.recordRole} that does not exist`,
                    )
                }
                for (const collection of restriction.collections) {
                    const assignableCollection = schema.collections[collection.collection]
                    if (!assignableCollection) {
                        errors.push(
                            `Collection ${collectionName} has an permission write restriction with collection ${collection.collection} that does not exist`,
                        )
                    } else {
                        if (collection.attributeRestrictions) {
                            for (const restriction of collection.attributeRestrictions) {
                                if (
                                    !assignableCollection.access.attributeRestrictions?.find(
                                        (restrictionItem) => restrictionItem.type === restriction,
                                    )
                                ) {
                                    errors.push(
                                        `Collection ${collectionName} has an permission write restriction with collection ${collection.collection} that has an attribute restriction ${restriction} that does not exist`,
                                    )
                                }
                            }
                        }
                        const permissionsCollection = schema.collections[collection.collection]
                        if (
                            !permissionsCollection.access.operations.assignable ||
                            (Array.isArray(permissionsCollection.access.operations.assignable) &&
                                !permissionsCollection.access.operations.assignable.includes(restriction.recordRole))
                        ) {
                            const roleRead = !!permissionsCollection.access.operations.read?.includes(
                                restriction.recordRole,
                            )
                            const roleCreate = !!permissionsCollection.access.operations.create?.includes(
                                restriction.recordRole,
                            )
                            const roleUpdate = !!permissionsCollection.access.operations.update?.includes(
                                restriction.recordRole,
                            )
                            const roleDelete = !!permissionsCollection.access.operations.delete?.includes(
                                restriction.recordRole,
                            )
                            const restrictionRead = !!collection.operations.includes("Read")
                            const restrictionCreate = !!collection.operations.includes("Create")
                            const restrictionUpdate = !!collection.operations.includes("Update")
                            const restrictionDelete = !!collection.operations.includes("Delete")
                            if (
                                roleRead !== restrictionRead ||
                                roleCreate !== restrictionCreate ||
                                roleUpdate !== restrictionUpdate ||
                                roleDelete !== restrictionDelete
                            ) {
                                errors.push(
                                    `Collection ${collectionName} has a permission write restriction for record role ${restriction.recordRole} that does not match the non-assignable access operations for collection ${collection.collection}`,
                                )
                            }
                        }
                    }
                }
            }
        }

        if (operations.read && errors.length === 0) {
            for (const role of operations.read) {
                const paginationEnabled = isPaginationEnabled(role, collectionSchema, schema)
                if (
                    paginationEnabled !== true &&
                    !(preloadCache?.roles.includes(role) || serverReadOnly?.includes(role))
                ) {
                    warnings.push(
                        `The admin app requires collection ${collectionName} to have preloadCache or serverReadOnly enabled for role ${role}. This is because the ${paginationEnabled} is enabled for this role and the singleQuery option is not set.`,
                    )
                }
            }
        }

        if (files?.assignment) {
            for (const role of Object.keys(files.assignment)) {
                if (!roles.includes(role)) {
                    errors.push(
                        `Collection ${collectionName} has a file assignment with role ${role} that does not exist`,
                    )
                }
                // eslint-disable-next-line security/detect-object-injection
                const assignmentValues = files.assignment[role]
                for (const operation of ["read", "update", "delete"]) {
                    if (assignmentValues.optional) {
                        for (const value of assignmentValues.optional[operation as keyof AccessFilesAssignmentRoles] ||
                            []) {
                            if (
                                assignmentValues.required?.[operation as keyof AccessFilesAssignmentRoles]?.includes(
                                    value,
                                )
                            ) {
                                errors.push(
                                    `Collection ${collectionName} has a file assignment with both optional and required ${operation} role ${value}`,
                                )
                            }
                            if (!roles.includes(value)) {
                                errors.push(
                                    `Collection ${collectionName} has a file assignment with optional ${operation} role ${value} that does not exist`,
                                )
                            }
                        }
                    }
                    if (assignmentValues.required) {
                        for (const value of assignmentValues.required[operation as keyof AccessFilesAssignmentRoles] ||
                            []) {
                            if (!roles.includes(value)) {
                                errors.push(
                                    `Collection ${collectionName} has a file assignment with required ${operation} role ${value} that does not exist`,
                                )
                            }
                        }
                    }
                }
            }
        }

        const allAccessFields = new Set<CollectionField>()
        for (const role of roles) {
            const accessFields = getAccessFields(collectionSchema, role)
            for (const field of accessFields) {
                allAccessFields.add(field)
                if (field.access && !field.access.includes(role)) {
                    errors.push(
                        `Role ${role} requires access to field ${field.name}, as it is required for access control.`,
                    )
                }
            }
        }
        for (const field of allAccessFields) {
            if (!field.required) {
                warnings.push(
                    `Collection ${collectionName} has a field ${field.name} that is required for access control but is not required`,
                )
            }
        }
        for (const field of fields) {
            if (isDependencyField(field, collectionSchema, schema)) {
                const dependencyFields = getDependencyIndexFields(field, collectionSchema, schema)
                for (const dependencyField of dependencyFields) {
                    if (dependencyField.access) {
                        errors.push(
                            `Collection ${collectionName} has a dependency index field ${dependencyField.name} that has access restrictions`,
                        )
                    }
                }
            }
        }

        for (const field of fields) {
            const { name, type, required, sorting, access, restrictCreate, restrictUpdate } = field

            const fieldCustomization = getFieldCustomization(field, customization)

            if (!(new TextEncoder().encode(name).length <= 1500)) {
                errors.push(
                    `Invalid field name: ${name}. Must be a valid Firestore field name - less than 1,500 bytes.`,
                )
            }
            const simpleRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/
            if (!simpleRegex.test(name)) {
                errors.push(`Invalid field name: ${name}. Must be a simple Firestore field name.`)
            }
            const regex = /^[^.[\]*`]+$/
            if (!regex.test(name)) {
                errors.push(`Invalid field name: ${name}. Must not contain any of the following characters: . [ ] * \``)
            }

            if (
                (("minlength" in field && field.minlength) || ("maxlength" in field && field.maxlength)) &&
                "length" in field &&
                field.length
            ) {
                errors.push(
                    `Collection ${collectionName} has a field ${name} with both length and minlength or maxlength set`,
                )
            }

            if ("autoIncrement" in field && field.autoIncrement && field.decimal) {
                errors.push(`Collection ${collectionName} has a field ${name} with both auto increment and decimal set`)
            }

            if (field.restrictCreate && required) {
                errors.push(
                    `Collection ${collectionName} has a field ${name} with both restrict create and required set`,
                )
            }

            if (
                ![
                    "Boolean",
                    "String",
                    "Number",
                    "Timestamp",
                    "Array",
                    "Map",
                    "OneToOne",
                    "OneToMany",
                    "ManyToOne",
                    "ManyToMany",
                    "Embedding",
                    "Computed",
                ].includes(type)
            ) {
                errors.push(`Collection ${collectionName} has a field ${name} with an invalid type ${type}`)
            }

            if (access) {
                for (const role of access) {
                    if (!roles.includes(role)) {
                        errors.push(
                            `Collection ${collectionName} has a field ${name} with access role ${role} that does not exist`,
                        )
                    }
                }
            }

            if (typeof restrictCreate === "object") {
                for (const role of restrictCreate) {
                    if (!roles.includes(role)) {
                        errors.push(
                            `Collection ${collectionName} has a field ${name} with restrict create role ${role} that does not exist`,
                        )
                    }
                }
            }
            if (typeof restrictUpdate === "object") {
                for (const role of restrictUpdate) {
                    if (!roles.includes(role)) {
                        errors.push(
                            `Collection ${collectionName} has a field ${name} with restrict update role ${role} that does not exist`,
                        )
                    }
                }
            }

            if (required) {
                const createRoles = operations.create || []
                for (const role of createRoles) {
                    if (access && !access.includes(role)) {
                        errors.push(
                            `Collection ${collectionName} has a required field ${name} that is not accessible to role ${role} which has create access`,
                        )
                    }
                }
            }

            const isLocation = await tryPromise(fieldCustomization.admin?.location)
            if (field.type === "Array" && isLocation && !field.nullable) {
                errors.push(`Collection ${collectionName} has a location field ${name} that is not nullable`)
            }

            if (type === "String" && fieldCustomization?.admin?.image) {
                const image = await tryPromise(fieldCustomization.admin.image)
                if (image && !field.pattern) {
                    warnings.push(
                        `Collection ${collectionName} field ${name} is an image field and should have the pattern property set to a valid URL pattern to prevent XSS attacks`,
                    )
                }
            }

            if (type === "String") {
                const validationProperties = ["ip", "url", "email", "uuid", "emoji", "pattern"].filter(
                    (prop) => prop in field && field[prop as keyof typeof field],
                )
                if (validationProperties.length > 1) {
                    errors.push(
                        `Collection ${collectionName} has a string field ${name} with multiple validation properties (${validationProperties.join(", ")}). Only one of ip, url, email, uuid, emoji, or pattern is allowed.`,
                    )
                }
            }

            if (isRelationField(field)) {
                if (!collectionNames.includes(field.collection)) {
                    errors.push(
                        `Collection ${collectionName} has a relation field ${name} with a collection ${field.collection} that does not exist`,
                    )
                    console.warn(warnings.join("\n"))
                    console.error(errors.join("\n"))
                    process.exit(1)
                }
                const relationCollection = schema.collections[field.collection]
                if (required && !field.dependencyFields) {
                    warnings.push(
                        `Collection ${collectionName} has a required relation field ${name} with no dependency fields`,
                    )
                }
                if (field.titleField && !field.includeFields?.includes(field.titleField)) {
                    errors.push(
                        `Collection ${collectionName} has a relation field ${name} with a title field ${field.titleField} that is not included in the include fields`,
                    )
                }
                if (field.titleField) {
                    const titleFieldSchema = getField(relationCollection.fields, field.titleField)
                    if (!titleFieldSchema) {
                        errors.push(
                            `Collection ${collectionName} has a relation field ${name} with a title field ${field.titleField} that does not exist`,
                        )
                    } else if (titleFieldSchema.type !== "String") {
                        errors.push(
                            `Collection ${collectionName} has a relation field ${name} with a title field ${field.titleField} that is not a string`,
                        )
                    }
                }
                if (
                    (("min" in field && field.min) || ("max" in field && field.max)) &&
                    "length" in field &&
                    field.length
                ) {
                    errors.push(`Collection ${collectionName} has a field ${name} with both length and min or max set`)
                }
                if (field.dependencyFields) {
                    for (const dependencyField of field.dependencyFields) {
                        const dependencyFields = relationCollection.fields.map((field) => field.name)
                        if (!dependencyFields.includes(dependencyField.field)) {
                            errors.push(
                                `Collection ${collectionName} has a relation field ${name} with a dependency field ${dependencyField.field} that does not exist`,
                            )
                        }
                        for (const role of dependencyField.roles) {
                            if (!roles.includes(role)) {
                                errors.push(
                                    `Collection ${collectionName} has a relation field ${name} with a dependency field ${dependencyField.field} with role ${role} that does not exist`,
                                )
                            }
                        }
                        const dependencyFieldSchema = getField(relationCollection.fields, dependencyField.field)
                        if (
                            dependencyFieldSchema &&
                            isDependencyField(dependencyFieldSchema, relationCollection, schema) &&
                            dependencyFieldSchema.access
                        ) {
                            const error = `Collection ${relationCollection.labels.collection} has a relation field ${dependencyField.field} that has both dependent collections and access restrictions`
                            if (!errors.includes(error)) {
                                errors.push(error)
                            }
                        }
                    }
                }
                if (field.includeFields) {
                    for (const includeField of field.includeFields) {
                        const includeFieldSchema = getField(relationCollection.fields, includeField)
                        if (!includeFieldSchema) {
                            errors.push(
                                `Collection ${collectionName} has a relation field ${name} with an include field ${includeField} that does not exist`,
                            )
                        } else {
                            if (
                                isIncludedField(includeFieldSchema, relationCollection, schema) &&
                                includeFieldSchema.access
                            ) {
                                const error = `Collection ${relationCollection.labels.collection} has a relation field ${includeField} that is both used in include fields and has access restrictions`
                                if (!errors.includes(error)) {
                                    errors.push(error)
                                }
                            }
                            if (isRelationField(includeFieldSchema)) {
                                errors.push(
                                    `Collection ${collectionName} has a relation field ${name} with an include field ${includeField} that is also a relation field`,
                                )
                            }
                            if (!includeFieldSchema.required) {
                                warnings.push(
                                    `Collection ${collectionName} has a relation field ${name} with an include field ${includeField} that is not required`,
                                )
                            }
                        }
                    }
                }
                if (field.enforceHierarchy) {
                    const { field: enforceField, recordLinkField } = field.enforceHierarchy
                    const enforceFieldSchema = getField(fields, enforceField)
                    const recordLinkFieldSchema = getField(relationCollection.fields, recordLinkField)
                    if (!enforceFieldSchema) {
                        errors.push(
                            `Collection ${collectionName} has a relation field ${name} with an enforce hierarchy field ${enforceField} that does not exist`,
                        )
                    } else {
                        if (!required) {
                            errors.push(
                                `Collection ${collectionName} has a relation field ${name} that has enforce hierarchy enabled but is not required`,
                            )
                        }
                        if (!enforceFieldSchema.required) {
                            errors.push(
                                `Collection ${collectionName} has a relation field ${name} with an enforce hierarchy field ${enforceField} that is not required`,
                            )
                        }
                        if (!["OneToOne", "OneToMany"].includes(enforceFieldSchema.type)) {
                            errors.push(
                                `Collection ${collectionName} has a relation field ${name} with an enforce hierarchy field ${enforceField} that is not a one to one or one to many relation`,
                            )
                        }
                    }
                    if (!recordLinkFieldSchema) {
                        errors.push(
                            `Collection ${collectionName} has a relation field ${name} with an enforce hierarchy record link field ${recordLinkField} that does not exist`,
                        )
                    } else if (!recordLinkFieldSchema.required) {
                        errors.push(
                            `Collection ${collectionName} has a relation field ${name} with an enforce hierarchy record link field ${recordLinkField} that is not required`,
                        )
                    }
                }
                if (field.twoWay) {
                    if (!serverWriteOnly) {
                        errors.push(
                            `Collection ${collectionName} has a two way relation field ${name} but does not have server write only set`,
                        )
                    }
                    const twoWayField = getField(relationCollection.fields, field.twoWay)
                    if (!twoWayField) {
                        errors.push(
                            `Collection ${collectionName} has a relation field ${name} with a two way field ${field.twoWay} that does not match`,
                        )
                    } else {
                        if (isRelationField(twoWayField) && (!twoWayField || twoWayField.twoWay !== name)) {
                            errors.push(
                                `Collection ${collectionName} has a relation field ${name} with a two way field ${field.twoWay} that does not match`,
                            )
                        } else {
                            if (!isRelationField(twoWayField)) {
                                errors.push(
                                    `Collection ${collectionName} has a relation field ${name} with a two way field ${field.twoWay} that is not a relation field`,
                                )
                            } else {
                                if (twoWayField.type !== getInverseRelationType(field.type)) {
                                    errors.push(
                                        `Collection ${collectionName} has a relation field ${name} with a two way field ${field.twoWay} that does not have the correct type`,
                                    )
                                }
                                if (twoWayField.collection !== collectionName) {
                                    errors.push(
                                        `Collection ${collectionName} has a relation field ${name} with a two way field ${field.twoWay} that does not have the correct collection`,
                                    )
                                }
                            }
                        }
                        if (field.restrictUpdate) {
                            warnings.push(
                                `Collection ${collectionName} has a relation field ${name} with a two way field ${field.twoWay} that has restrictUpdate set`,
                            )
                        }
                        if (field.required && !field.preserve) {
                            warnings.push(
                                `Collection ${collectionName} has a relation field ${name} that is required but does not have the preserve option set. This means that relations will be removed when the ${field.collection} record is deleted, potentially leaving required fields empty.`,
                            )
                        }
                        const twoWayCollection = schema.collections[field.collection]
                        const { access: twoWayAccess } = twoWayCollection
                        if (twoWayAccess.operations.assignable) {
                            warnings.push(
                                `Collection ${collectionName} has a two way relation field ${name} with collection ${field.collection} that has assignable operations set`,
                            )
                        }
                        if (
                            twoWayAccess.entityRestrictions?.restrictions?.length ||
                            twoWayAccess.entityRestrictions?.parentFilters?.length
                        ) {
                            warnings.push(
                                `Collection ${collectionName} has a two way relation field ${name} with collection ${field.collection} that has entity restrictions set`,
                            )
                        }
                        if (twoWayAccess.attributeRestrictions?.length) {
                            warnings.push(
                                `Collection ${collectionName} has a two way relation field ${name} with collection ${field.collection} that has attribute restrictions set`,
                            )
                        }
                    }
                }
                if (["OneToOne", "OneToMany"].includes(type) && (field.min || field.max || field.length)) {
                    errors.push(`Collection ${collectionName} has a ${type} field ${name} with min, max, or length set`)
                }
            }
            if ("unique" in field && field.unique) {
                if (!["String", "Number", "Timestamp"].includes(type)) {
                    errors.push(
                        `Collection ${collectionName} has a unique field ${name} that is not a string or number or timestamp`,
                    )
                }
                if (field.values) {
                    errors.push(`Collection ${collectionName} has a unique field ${name} that also has values set`)
                }
            }

            if (sorting) {
                if (isRelationField(field) && !field.titleField) {
                    errors.push(
                        `Collection ${collectionName} has sorting enabled for relation field ${name}, but no title field has been set`,
                    )
                }
                if (typeof sorting === "object" && sorting.roles) {
                    for (const role of sorting.roles) {
                        if (!roles.includes(role)) {
                            errors.push(
                                `Collection ${collectionName} has sorting enabled for field ${name} with role ${role} that does not exist`,
                            )
                        }
                        if (field.access && !field.access.includes(role)) {
                            errors.push(
                                `Collection ${collectionName} has sorting enabled for field ${name} with role ${role} that does not have access to the field`,
                            )
                        }
                    }
                }
            }
        }

        for (const role of roles) {
            if (
                operations.assignable === true ||
                (typeof operations.assignable === "object" && operations.assignable.includes(role)) ||
                operations.read?.includes(role)
            ) {
                let disjunctions = 0
                let hasArrayContains = false
                let profileProcessed = false

                const incrementDisjunctions = (value: number | undefined) => {
                    if (!value) return
                    if (disjunctions === 0) {
                        disjunctions = value
                    } else {
                        disjunctions *= value
                    }
                }

                if (attributeRestrictions) {
                    for (const restriction of attributeRestrictions) {
                        if (restriction.operations && !restriction.operations.includes("Read")) continue
                        if (restriction.roles.some((roleItem) => roleItem.role === role)) {
                            if (restriction.type === "Record_Property") {
                                const propertyRole = restriction.roles.find((roleItem) => roleItem.role === role)
                                const propertyField = getField(fields, restriction.propertyField)
                                if (propertyField.type === "Array") {
                                    if (hasArrayContains) {
                                        errors.push(
                                            `Collection ${collectionName} cannot have both a Record_User entity restriction and a Record_Property attribute restriction on an Array field, for role ${role}.`,
                                        )
                                    }
                                    hasArrayContains = true
                                }
                                incrementDisjunctions(propertyRole?.values?.length)
                            }
                            if (restriction.type === "Record_User") {
                                if (hasArrayContains) {
                                    errors.push(
                                        `Collection ${collectionName} cannot have both a Record_User entity restriction and a Record_Property attribute restriction on an Array field, for role ${role}.`,
                                    )
                                }
                                hasArrayContains = true
                            }
                        }
                    }
                }
                if (entityRestrictions?.restrictions) {
                    for (const restriction of entityRestrictions.restrictions) {
                        if (restriction.roles.some((roleItem) => roleItem.role === role)) {
                            if (restriction.type === "Individual") {
                                if (restriction.singleQuery && !profileProcessed) {
                                    incrementDisjunctions(restriction.singleQuery)
                                    profileProcessed = true
                                }
                            } else if (restriction.type === "Parent") {
                                if (restriction.singleQuery && !profileProcessed) {
                                    incrementDisjunctions(restriction.singleQuery)
                                    profileProcessed = true
                                }
                                hasArrayContains = true
                            }
                        }
                    }
                }
                if (entityRestrictions?.parentFilters) {
                    for (const parentFilterItem of entityRestrictions.parentFilters) {
                        if (parentFilterItem.roles.some((roleItem) => roleItem.role === role)) {
                            const collectionFieldSchema = getField(fields, parentFilterItem.collectionField)
                            if (!isRelationField(collectionFieldSchema)) continue
                            const parentCollection = schema.collections[collectionFieldSchema.collection]
                            const matchingAssignment = parentCollection.access.entityRestrictions?.restrictions?.find(
                                (restriction) =>
                                    restriction.type === parentFilterItem.type &&
                                    restriction.roles.some((roleItem) => roleItem.role === role),
                            )
                            if (!(matchingAssignment?.type === "Individual" || matchingAssignment?.type === "Parent"))
                                continue
                            if (parentFilterItem.type === "Individual") {
                                if (matchingAssignment?.singleQuery && !profileProcessed) {
                                    incrementDisjunctions(matchingAssignment.singleQuery)
                                    profileProcessed = true
                                }
                                hasArrayContains = true
                            } else if (parentFilterItem.type === "Parent") {
                                if (matchingAssignment?.singleQuery && !profileProcessed) {
                                    incrementDisjunctions(matchingAssignment.singleQuery)
                                    profileProcessed = true
                                }
                                hasArrayContains = true
                            } else if (parentFilterItem.type === "Parent_Property") {
                                hasArrayContains = true
                            }
                        }
                    }
                }
                if (preloadCache?.roles.includes(role)) {
                    if (preloadCache.range) {
                        incrementDisjunctions(preloadCache.range.fields.length)
                    }
                }
                if (statusField && !preloadCache?.roles.includes(role)) {
                    incrementDisjunctions(Math.max(statusField.active?.length || 0, statusField.archived?.length || 0))
                }
                if (filters && !preloadCache?.roles.includes(role)) {
                    for (const filter of filters) {
                        if (filter.type === "range") continue
                        if (filter.roles && !filter.roles.includes(role)) continue
                        if (filter.type === "relation" && hasArrayContains) {
                            errors.push(
                                `Collection ${collectionName} has a relation filter for role ${role} on field ${filter.field} that uses an array contains filter, but an array-contains filter has already been used. This can be resolved by using the preload cache.`,
                            )
                        }
                        if (filter.type === "select") {
                            const field = getField(fields, filter.field)
                            if (field.type === "Array" && hasArrayContains) {
                                errors.push(
                                    `Collection ${collectionName} has a select filter for role ${role} on field ${filter.field} that uses an array contains filter, but an array-contains filter has already been used. This can be resolved by using the preload cache.`,
                                )
                            }
                        }
                    }
                }

                const batchSize = disjunctions === 0 ? 30 : Math.max(1, Math.floor(30 / disjunctions))
                if (disjunctions > 30) {
                    errors.push(
                        `Collection ${collectionName} for role ${role} has ${disjunctions} disjunctions. The limit set by Firestore is 30.`,
                    )
                } else if (batchSize < 5) {
                    warnings.push(
                        `Collection ${collectionName} for role ${role} will be loaded in batches of ${batchSize}. This is less than the recommended minimum of 5.`,
                    )
                }
            }
        }
    }

    if (!authCollectionFound) {
        errors.push("No auth collection found")
    }

    const formattedWarnings = warnings.map((warning) => {
        return `WARN: ${warning}`
    })

    if (errors.length) {
        const formattedErrors = errors.map((error) => {
            return `ERROR: ${error}`
        })
        console.warn(formattedWarnings.join("\n"))
        console.error(formattedErrors.join("\n"))
        process.exit(1)
    }

    if (!noLog) {
        console.warn(formattedWarnings.join("\n"))
        console.log("Schema linted successfully.")
        process.exit()
    }

    return
}

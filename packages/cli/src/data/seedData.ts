import { initializeStoker, addRecord, updateRecord, fetchCurrentSchema } from "@stoker-platform/node-client"
import { CollectionField, CollectionSchema, StokerCollection, StokerRecord } from "@stoker-platform/types"
import { join } from "node:path"
import { faker } from "@faker-js/faker"
import { Timestamp } from "firebase-admin/firestore"
import { getField, getFieldCustomization, isRelationField, tryPromise } from "@stoker-platform/utils"

/* eslint-disable security/detect-object-injection */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const seedData = async (options: any) => {
    const records = parseInt(options.number)
    const relationRecords = parseInt(options.relations)
    const sucollectionRecords = parseInt(options.sucollections)
    const delay = parseInt(options.delay)

    if (isNaN(records)) {
        throw new Error("Number of records must be a valid number")
    }
    if (options.relationRecords && isNaN(relationRecords)) {
        throw new Error("Number of relations must be a valid number")
    }
    if (options.sucollectionRecords && isNaN(sucollectionRecords)) {
        throw new Error("Number of subcollections must be a valid number")
    }
    if (options.delay && isNaN(parseInt(options))) {
        throw new Error("Delay must be a valid number")
    }

    const { getCustomizationFile } = await initializeStoker(
        options.mode || "development",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )

    const schema = await fetchCurrentSchema()
    const collections = (options.collections as StokerCollection[]) || Object.keys(schema.collections)
    const orderedCollections = collections.sort((a, b) => {
        const schemaA = schema.collections[a]
        const schemaB = schema.collections[b]
        const seedOrderA = schemaA.seedOrder || Number.MAX_SAFE_INTEGER
        const seedOrderB = schemaB.seedOrder || Number.MAX_SAFE_INTEGER
        return seedOrderA - seedOrderB
    })

    if (relationRecords > records) {
        throw new Error("Relations records must be less than records")
    }
    if (sucollectionRecords > records) {
        throw new Error("Subcollections records must be less than records")
    }

    const data: { [key: StokerCollection]: StokerRecord[] } = {}
    const numbers: { [key: StokerCollection]: { [key: string]: number } } = {}
    const unique: { [key: StokerCollection]: { [key: string]: (string | number)[] } } = {}
    const twoWayProcessed: { [key: StokerCollection]: string[] } = {}
    const fieldCount: { [key: StokerCollection]: { [key: string]: number } } = {}

    const seedField = async (record: Partial<StokerRecord>, field: CollectionField, collection: CollectionSchema) => {
        const customizationFile = getCustomizationFile(collection.labels.collection, schema)
        const fieldCustomization = getFieldCustomization(field, customizationFile)
        const { labels, auth } = collection
        switch (field.type) {
            case "String": {
                const getStringValue = () => {
                    if (auth && field.name === "Name") {
                        record[field.name] = faker.person.fullName()
                    } else if (field.values) {
                        record[field.name] = field.values[Math.floor(Math.random() * field.values.length)]
                    } else if (field.uuid) {
                        record[field.name] = faker.string.uuid()
                    } else if (field.email) {
                        record[field.name] = faker.internet.email()
                    } else if (field.ip) {
                        record[field.name] = faker.internet.ip()
                    } else if (field.url) {
                        record[field.name] = faker.image.url({
                            width: Math.floor(Math.random() * (500 - 25 + 1)) + 25,
                            height: Math.floor(Math.random() * (500 - 25 + 1)) + 25,
                        })
                    } else if (field.emoji) {
                        record[field.name] = faker.internet.emoji()
                    } else if (field.pattern) {
                        const generatedValue = faker.helpers.fromRegExp(field.pattern)
                        record[field.name] = generatedValue.split("\\").join("").slice(1, -1)
                    } else {
                        const minLength = field.minlength || 5
                        const maxLength = field.maxlength || 500
                        const length =
                            field.length || Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength
                        record[field.name] = faker.string.alpha({ length })
                    }
                }
                getStringValue()
                if (field.unique) {
                    unique[labels.collection][field.name] ||= []
                    while (unique[labels.collection][field.name].includes(record[field.name])) {
                        getStringValue()
                    }
                    unique[labels.collection][field.name].push(record[field.name])
                }
                break
            }
            case "Number": {
                const getNumberValue = () => {
                    if (field.autoIncrement) {
                        numbers[labels.collection][field.name] ||= 0
                        numbers[labels.collection][field.name]++
                        record[field.name] = numbers[labels.collection][field.name]
                    } else if (field.values) {
                        record[field.name] = field.values[Math.floor(Math.random() * field.values.length)]
                    } else if (field.decimal) {
                        record[field.name] = faker.number.float({
                            fractionDigits: field.decimal || 2,
                            min: field.min || 0,
                            max: field.max || 1000,
                        })
                    } else {
                        record[field.name] = faker.number.int({
                            min: field.min || 0,
                            max: field.max || 1000,
                        })
                    }
                }
                getNumberValue()
                if (field.unique) {
                    unique[labels.collection][field.name] ||= []
                    while (unique[labels.collection][field.name].includes(record[field.name])) {
                        getNumberValue()
                    }
                    unique[labels.collection][field.name].push(record[field.name])
                }
                break
            }
            case "Boolean":
                record[field.name] = faker.datatype.boolean()
                break
            case "Timestamp": {
                if (collection.ttl === field.name) {
                    record[field.name] = Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 24 * 30))
                } else {
                    const minDate = field.min ? new Date(field.min) : new Date(0)
                    const maxDate = field.max ? new Date(field.max) : new Date()
                    const randomDate = new Date(
                        minDate.getTime() + Math.random() * (maxDate.getTime() - minDate.getTime()),
                    )
                    record[field.name] = Timestamp.fromDate(randomDate)
                }
                break
            }
            case "Array": {
                const isLocation = await tryPromise(fieldCustomization.admin?.location)
                if (isLocation) {
                    record[field.name] = [faker.location.latitude(), faker.location.longitude()]
                } else {
                    if (field.values) {
                        const arrayLength =
                            field.length ||
                            Math.floor(Math.random() * ((field.maxlength || 10) - (field.minlength || 1) + 1)) +
                                (field.minlength || 1)
                        record[field.name] = Array.from({ length: arrayLength }, () =>
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            faker.helpers.arrayElement(field.values!),
                        )
                    } else {
                        const arrayLength =
                            field.length ||
                            Math.floor(Math.random() * ((field.maxlength || 10) - (field.minlength || 1) + 1)) +
                                (field.minlength || 1)
                        record[field.name] = Array.from({ length: arrayLength }, () => {
                            const elementLength = Math.min(Math.floor(Math.random() * 10) + 1, field.maxlength || 10)
                            return faker.string.alpha({ length: elementLength })
                        })
                    }
                }
                break
            }
            case "Map": {
                const isRichText = await tryPromise(fieldCustomization.admin?.richText)
                record[field.name] = {}
                if (!isRichText) {
                    const numKeys = Math.floor(Math.random() * 100) + 1
                    for (let j = 0; j < numKeys; j++) {
                        const key = faker.string.alpha({ length: Math.floor(Math.random() * 10) + 1 })
                        record[field.name][key] = faker.string.alpha({ length: Math.floor(Math.random() * 10) + 1 })
                    }
                } else {
                    record[field.name] = {
                        ops: [
                            {
                                insert: "Test\n",
                            },
                        ],
                    }
                }
                break
            }
        }
    }

    const getRelation = (field: CollectionField, record: Partial<StokerRecord>, collection: CollectionSchema) => {
        if (isRelationField(field)) {
            const relationCollection = schema.collections[field.collection]
            const { parentCollection, singleton } = relationCollection
            if (parentCollection || singleton) return
            const count = fieldCount[collection.labels.collection][field.name]
            const relationField: { [key: string]: { [key: string]: unknown } } = {}
            let numberOfRelations = 1
            if (["ManyToOne", "ManyToMany"].includes(field.type)) {
                if (field.length) {
                    numberOfRelations = field.length
                } else {
                    const min = field.min || 1
                    const max = relationRecords || field.max || 5
                    numberOfRelations = Math.floor(Math.random() * (max - min + 1)) + min
                }
            }
            for (let i = 0; i < numberOfRelations; i++) {
                let relationRecord: StokerRecord | undefined

                if (field.enforceHierarchy) {
                    const enforceHierarchy = field.enforceHierarchy
                    const parentField = getField(collection.fields, field.enforceHierarchy.field)
                    const options = []
                    for (const parentRecord of data[field.collection]) {
                        if (
                            Object.keys(record[parentField.name]).every((parentRelation) =>
                                Object.keys(parentRecord[enforceHierarchy.recordLinkField]).includes(parentRelation),
                            )
                        ) {
                            options.push(parentRecord)
                        }
                    }
                    const index = Math.floor(Math.random() * options.length)
                    relationRecord = options[index]
                } else {
                    if (!data[field.collection]) {
                        throw new Error(
                            `Collection ${field.collection} has not had any records added yet. Try changing the seed order of the collection.`,
                        )
                    }
                    relationRecord = data[field.collection][count]
                }

                if (relationRecord) {
                    fieldCount[collection.labels.collection][field.name]++
                    if (fieldCount[collection.labels.collection][field.name] === records) {
                        fieldCount[collection.labels.collection][field.name] = 0
                    }

                    relationField[relationRecord.id] = {
                        Collection_Path: relationRecord.Collection_Path,
                    }
                    if (field.includeFields) {
                        for (const includeField of field.includeFields) {
                            relationField[relationRecord.id][includeField] = relationRecord[includeField]
                        }
                    }
                    if (field.twoWay) {
                        relationRecord[field.twoWay] = {
                            [record.id]: {
                                Collection_Path: record.Collection_Path,
                            },
                        }
                    }
                }
            }
            return relationField
        }
        return
    }

    for (const collection of orderedCollections) {
        const collectionSchema = schema.collections[collection]
        const { auth, fields, parentCollection, singleton, softDelete } = collectionSchema
        if (parentCollection || singleton) continue
        data[collection] = []
        numbers[collection] = {}
        unique[collection] = {}
        twoWayProcessed[collection] ||= []
        fieldCount[collection] ||= {}
        for (let i = 0; i < records; i++) {
            const record: Partial<StokerRecord> = {}
            for (const field of fields) {
                if (field.type === "Embedding") continue
                if (softDelete?.timestampField === field.name) continue
                if (softDelete?.archivedField === field.name) {
                    record[field.name] = false
                    continue
                }
                if (field.restrictCreate === true) continue
                if (!isRelationField(field) && !(auth && field.name === "User_ID")) {
                    await seedField(record, field, collectionSchema)
                } else if (
                    isRelationField(field) &&
                    (field.required || field.min) &&
                    !(field.twoWay && (twoWayProcessed[collection].includes(field.name) || field.type === "ManyToOne"))
                ) {
                    fieldCount[collection][field.name] ||= 0
                    const relation = getRelation(field, record, collectionSchema)
                    if (relation) {
                        record[field.name] = relation
                    }
                }
            }
            if (delay) {
                await new Promise((resolve) => setTimeout(resolve, delay))
            }
            const result = await addRecord([collection], record)
            data[collection].push(result)
            console.log(`Added record ${result.id} to collection ${collection}`)
        }
        for (const field of fields) {
            if (isRelationField(field) && field.twoWay && field.required) {
                twoWayProcessed[field.collection] ||= []
                twoWayProcessed[field.collection].push(field.twoWay)
            }
        }
    }

    for (const collection of orderedCollections) {
        const collectionSchema = schema.collections[collection]
        const { fields, parentCollection, singleton } = collectionSchema
        if (parentCollection || singleton) continue
        for (const record of data[collection]) {
            const updatedRecord: Partial<StokerRecord> = {}
            for (const field of fields) {
                if (field.restrictUpdate === true) continue
                if (
                    isRelationField(field) &&
                    (field.required || field.min) &&
                    !(field.twoWay && (twoWayProcessed[collection].includes(field.name) || field.type === "ManyToOne"))
                ) {
                    fieldCount[collection][field.name] ||= 0
                    const relation = getRelation(field, record, collectionSchema)
                    if (relation) {
                        updatedRecord[field.name] = relation
                    }
                }
            }
            if (delay) {
                await new Promise((resolve) => setTimeout(resolve, delay))
            }
            const result = await updateRecord([collection], record.id, updatedRecord)
            const index = data[collection].findIndex((r) => r.id === result.id)
            data[collection] = data[collection].with(index, result)
            console.log(`Added relations to record ${result.id} in collection ${collection}`)
        }
        for (const field of fields) {
            if (isRelationField(field) && field.twoWay && !field.required) {
                twoWayProcessed[field.collection] ||= []
                twoWayProcessed[field.collection].push(field.twoWay)
            }
        }
    }

    process.exit()
}

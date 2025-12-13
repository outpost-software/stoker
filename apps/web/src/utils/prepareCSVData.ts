import { CollectionSchema, StokerRecord, StokerRelation } from "@stoker-platform/types"
import { getFieldCustomization, isRelationField, tryFunction } from "@stoker-platform/utils"
import { getCollectionConfigModule, getGlobalConfigModule, getSchema } from "@stoker-platform/web-client"
import { Timestamp } from "firebase/firestore"
import { DateTime } from "luxon"

const escapeCSVField = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null) {
        return ""
    }

    const stringValue = String(value)

    const formulaInjectionChars = ["=", "+", "-", "@", "\t", "\0", "\r", "\n"]
    const needsFormulaProtection = formulaInjectionChars.some((char) => stringValue.startsWith(char))

    if (needsFormulaProtection) {
        return `'${stringValue}`
    }

    return stringValue
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prepareCSVData = (collection: CollectionSchema, data: any[]) => {
    const { labels, fields, softDelete } = collection
    const customization = getCollectionConfigModule(labels.collection)
    const globalConfig = getGlobalConfigModule()
    const schema = getSchema()
    const dateFormat = tryFunction(globalConfig.admin?.dateFormat) || "dd/MM/yyyy"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CSVData: { data: any[]; headers: any[] } = { data: [], headers: [] }
    for (const field of fields) {
        if (field.type === "Map") continue
        if (field.type === "Embedding") continue
        if (field.name === softDelete?.archivedField) continue
        if (field.name === softDelete?.timestampField) continue
        if (collection.auth && field.name === "User_ID") continue
        const fieldCustomization = getFieldCustomization(field, customization)
        const label = tryFunction(fieldCustomization.admin?.label) || field.name
        const noExport = tryFunction(fieldCustomization.admin?.noExport) || false
        if (noExport) continue
        CSVData.headers.push({ label: escapeCSVField(label), key: field.name })
    }
    for (const doc of data) {
        if (softDelete && doc[softDelete.archivedField]) continue
        const docData = {} as StokerRecord
        for (const field of fields) {
            if (field.type === "Map") continue
            if (field.type === "Embedding") continue
            if (field.name === softDelete?.archivedField) continue
            if (field.name === softDelete?.timestampField) continue
            if (collection.auth && field.name === "User_ID") continue
            const fieldCustomization = getFieldCustomization(field, customization)
            const noExport = tryFunction(fieldCustomization.admin?.noExport) || false
            if (noExport) continue
            if (fieldCustomization.admin?.condition?.form) {
                const condition = tryFunction(fieldCustomization.admin?.condition?.form, ["update", doc])
                if (condition === false) {
                    docData[field.name] = ""
                    continue
                }
            }
            const separator = tryFunction(fieldCustomization.admin?.exportSeparator) || ", "

            if (field.type === "Boolean") {
                docData[field.name] = escapeCSVField(doc[field.name] ? "Yes" : "No")
            } else if (field.type === "Timestamp" && doc[field.name]) {
                const formattedDate = DateTime.fromJSDate((doc[field.name] as Timestamp).toDate()).toFormat(dateFormat)
                docData[field.name] = escapeCSVField(formattedDate)
            } else if (isRelationField(field) && doc[field.name]) {
                const relationCollection = schema.collections[field.collection]
                const relationValue = Object.values(doc[field.name])
                    ?.map((relation) => {
                        return (relation as StokerRelation)[relationCollection.recordTitleField || "id"]
                    })
                    .join(separator)
                docData[field.name] = escapeCSVField(relationValue)
            } else if (field.type === "Array" && doc[field.name]) {
                const arrayValue = doc[field.name].join(separator)
                docData[field.name] = escapeCSVField(arrayValue)
            } else if (field.type === "Computed" && doc[field.name]) {
                let computedValue: string
                if (doc[field.name] === "cross") {
                    computedValue = "No"
                } else if (doc[field.name] === "tick") {
                    computedValue = "Yes"
                } else {
                    computedValue = doc[field.name]
                }
                docData[field.name] = escapeCSVField(computedValue)
            } else if (doc[field.name] !== undefined) {
                docData[field.name] = escapeCSVField(doc[field.name])
            }
        }
        CSVData.data.push(docData)
    }
    return CSVData
}

import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import MiniSearch, { Options } from "minisearch"
import { getSearchOptions, isExactPhraseSearch } from "./fullTextSearch"

const flattenToSearchText = (value: unknown): string => {
    if (value == null) return ""
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value)
    }
    if (Array.isArray(value)) {
        return value.map(flattenToSearchText).filter(Boolean).join(" ")
    }
    if (typeof value === "object") {
        return Object.values(value).map(flattenToSearchText).filter(Boolean).join(" ")
    }
    return ""
}

const valueContainsPhrase = (value: unknown, phrase: string): boolean => {
    if (value == null) return false
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return String(value).toLowerCase().includes(phrase)
    }
    if (Array.isArray(value)) {
        return value.some((item) => valueContainsPhrase(item, phrase))
    }
    if (typeof value === "object") {
        return Object.values(value).some((item) => valueContainsPhrase(item, phrase))
    }
    return false
}

const recordMatchesPhrase = (record: StokerRecord, fields: string[], phrase: string) =>
    // eslint-disable-next-line security/detect-object-injection
    fields.some((field) => valueContainsPhrase(record[field], phrase))

export const localFullTextSearch = (
    collection: CollectionSchema,
    query: string,
    list: StokerRecord[],
    filter?: (result: StokerRecord) => boolean,
) => {
    const { recordTitleField, fullTextSearch } = collection
    const fields = fullTextSearch || [recordTitleField]
    const searchOptions = getSearchOptions(collection)

    if (filter) {
        list = list.filter((record) => filter(record))
    }

    const phrase = query.trim().toLowerCase()
    const exactPhrase = isExactPhraseSearch(collection)

    if (exactPhrase) {
        if (!phrase) return []
        return list
            .filter((record) => recordMatchesPhrase(record, fields, phrase))
            .map((record) => ({
                id: record.id,
                score: 1,
                terms: [phrase],
                queryTerms: [phrase],
                match: { [phrase]: fields },
                // eslint-disable-next-line security/detect-object-injection
                ...Object.fromEntries(fields.map((field) => [field, record[field]])),
            }))
    }

    const miniSearchConfig: Options = {
        fields,
        storeFields: fields,
        searchOptions,
        stringifyField: (fieldValue) => flattenToSearchText(fieldValue),
    }

    const miniSearch = new MiniSearch(miniSearchConfig)
    miniSearch.addAll(list)
    return miniSearch.search(query)
}

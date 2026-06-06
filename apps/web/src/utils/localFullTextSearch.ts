import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import MiniSearch, { Options } from "minisearch"

export const localFullTextSearch = (
    collection: CollectionSchema,
    query: string,
    list: StokerRecord[],
    filter?: (result: StokerRecord) => boolean,
    tokenize?: boolean,
) => {
    const { recordTitleField, fullTextSearch } = collection
    const miniSearchConfig: Options = {
        fields: fullTextSearch || [recordTitleField],
        storeFields: fullTextSearch || [recordTitleField],
        searchOptions: {
            ...(collection.searchOptions || {
                fuzzy: 0.2,
                prefix: true,
            }),
        },
    }
    if (filter) {
        list = list.filter((record) => filter(record))
    }
    if (tokenize) {
        miniSearchConfig.tokenize = (string) => [string]
    }
    const miniSearch = new MiniSearch(miniSearchConfig)
    miniSearch.addAll(list)
    const results = miniSearch.search(query)
    return results
}

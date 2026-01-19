import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import MiniSearch, { Options, SearchResult } from "minisearch"

export const localFullTextSearch = (
    collection: CollectionSchema,
    query: string,
    list: StokerRecord[],
    filter?: (result: SearchResult) => boolean,
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
            filter,
        },
    }
    if (tokenize) {
        miniSearchConfig.tokenize = (string) => [string]
    }
    const miniSearch = new MiniSearch(miniSearchConfig)
    // eslint-disable-next-line security/detect-object-injection
    miniSearch.addAll(list)
    const results = miniSearch.search(query)
    return results
}

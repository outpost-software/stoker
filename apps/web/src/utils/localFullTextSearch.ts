import { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import MiniSearch, { SearchResult } from "minisearch"

export const localFullTextSearch = (
    collection: CollectionSchema,
    query: string,
    list: StokerRecord[],
    filter?: (result: SearchResult) => boolean,
) => {
    const { recordTitleField, fullTextSearch } = collection
    const miniSearch = new MiniSearch({
        fields: fullTextSearch || [recordTitleField],
        storeFields: fullTextSearch || [recordTitleField],
        tokenize: (string) => [string],
        searchOptions: {
            ...(collection.searchOptions || {
                fuzzy: 0.2,
                prefix: true,
            }),
            filter,
        },
    })
    // eslint-disable-next-line security/detect-object-injection
    miniSearch.addAll(list)
    const results = miniSearch.search(query)
    return results
}

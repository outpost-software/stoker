import { CollectionSchema } from "@stoker-platform/types"
import { getCollectionConfigModule } from "@stoker-platform/web-client"

export const getSearchOptions = (collection: CollectionSchema) => {
    const customization = getCollectionConfigModule(collection.labels.collection)
    return (
        customization.admin?.searchOptions || {
            fuzzy: false,
            prefix: false,
        }
    )
}

export const isExactPhraseSearch = (collection: CollectionSchema) => {
    const searchOptions = getSearchOptions(collection)
    return searchOptions.fuzzy === false && searchOptions.prefix === false
}

export const isServerFullTextSearch = (
    search: string | undefined,
    collection: CollectionSchema,
    isPreloadCacheEnabled: boolean | undefined,
    isServerReadOnly: boolean | undefined,
) => !!(search && collection.fullTextSearch && !isPreloadCacheEnabled && !isServerReadOnly)

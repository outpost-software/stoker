import { getCollectionConfigModule, getCurrentUserPermissions, getSchema } from "@stoker-platform/web-client"
import { SearchAllResults } from "./SearchAllResults"
import { PopoverContent } from "./components/ui/popover"
import { collectionAccess, tryFunction } from "@stoker-platform/utils"

export const SearchAll = ({ query }: { query: string }) => {
    const schema = getSchema()
    const permissions = getCurrentUserPermissions()
    const orderedCollections = Object.values(schema.collections).sort((a, b) => {
        const customizationA = getCollectionConfigModule(a.labels.collection)
        const customizationB = getCollectionConfigModule(b.labels.collection)
        const posA = customizationA.admin?.navbarPosition ? tryFunction(customizationA.admin.navbarPosition) : Infinity
        const posB = customizationB.admin?.navbarPosition ? tryFunction(customizationB.admin.navbarPosition) : Infinity
        return posA - posB
    })

    return (
        <PopoverContent
            onOpenAutoFocus={(e) => e.preventDefault()}
            side="bottom"
            className="w-[1000px] max-h-[80vh] overflow-hidden"
        >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-4 max-h-[calc(80vh-100px)]">
                {orderedCollections.map((collection) => {
                    const { fullTextSearch } = collection
                    if (!permissions?.collections) return null
                    // eslint-disable-next-line security/detect-object-injection
                    const collectionPermissions = permissions.collections[collection.labels.collection]
                    if (!collectionAccess("Read", collectionPermissions)) return null
                    if (collection.singleton || collection.parentCollection || !fullTextSearch) return null
                    return (
                        <div key={collection.labels.collection}>
                            <SearchAllResults collection={collection} search={query} />
                        </div>
                    )
                })}
            </div>
        </PopoverContent>
    )
}

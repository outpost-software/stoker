import { Assignable, CollectionSchema, RelationList, StokerRecord } from "@stoker-platform/types"
import { useMemo } from "react"
import { createPortal } from "react-dom"
import { Filters } from "./Filters"
import { useFilters } from "./providers/FiltersProvider"
import { Separator } from "./components/ui/separator"

export const SidebarFilters = ({
    container,
    collection,
    relationList,
    relationCollection,
    relationParent,
    assignable,
    isAssigning,
}: {
    container: HTMLElement
    collection: CollectionSchema
    relationList: RelationList
    relationCollection: CollectionSchema
    relationParent: StokerRecord
    assignable?: Assignable
    isAssigning?: boolean
}) => {
    const { filters } = useFilters()
    const showFilters = relationList.showFilters

    const excluded = useMemo(
        () =>
            filters
                .filter((filter) => filter.type !== "status" && filter.type !== "range")
                .map((filter) => filter.field)
                .filter((field) => !showFilters?.includes(field)),
        [filters, showFilters],
    )

    if (!showFilters?.length) return null
    const hasFiltersToShow = filters.some(
        (filter) => filter.type !== "status" && filter.type !== "range" && showFilters.includes(filter.field),
    )
    if (!hasFiltersToShow) return null

    return createPortal(
        <div className="flex flex-col gap-4 px-2 pt-2">
            <Separator />
            <Filters
                collection={collection}
                excluded={excluded}
                relationList={relationList}
                relationCollection={relationCollection}
                relationParent={relationParent}
                assignable={assignable}
                isAssigning={isAssigning}
                isSidebar={true}
            />
        </div>,
        container,
    )
}

import { CollectionSchema, RelationField, StokerRecord, StokerRelation } from "@stoker-platform/types"
import { useGoToRecord } from "./utils/goToRecord"
import { getCollectionConfigModule, getSchema } from "@stoker-platform/web-client"
import { getField, getFieldCustomization, tryFunction } from "@stoker-platform/utils"
import { Fragment, useMemo } from "react"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "./components/ui/breadcrumb"

export const Breadcrumbs = ({
    breadcrumbs,
    collection,
    record,
}: {
    breadcrumbs: string[] | undefined
    collection: CollectionSchema
    record: StokerRecord
}) => {
    const { recordTitleField } = collection
    const schema = getSchema()
    const customization = getCollectionConfigModule(collection.labels.collection)
    const goToRecord = useGoToRecord()

    const filteredBreadcrumbs = breadcrumbs
        ?.filter((breadcrumb) => {
            const field = getField(collection.fields, breadcrumb) as RelationField
            return field && record[`${field.name}_Array`]?.length
        })
        .map((breadcrumb) => {
            const field = getField(collection.fields, breadcrumb) as RelationField
            const fieldCustomization = getFieldCustomization(field, customization)
            const label = tryFunction(fieldCustomization.admin?.label) || field.name
            return {
                key: breadcrumb,
                label,
                field,
            }
        })

    /* eslint-disable security/detect-object-injection */
    const records: Record<string, { title: string; collection: CollectionSchema; record: Record<string, unknown> }> =
        useMemo(() => {
            if (!breadcrumbs?.length) return {}

            const recordMap: Record<
                string,
                { title: string; collection: CollectionSchema; record: Record<string, unknown> }
            > = {}

            for (const breadcrumb of breadcrumbs) {
                const field = getField(collection.fields, breadcrumb) as RelationField
                if (!field) continue
                if (["ManyToOne", "ManyToMany"].includes(field.type)) continue
                const titleField = field.titleField
                if (titleField && field.includeFields?.includes(titleField)) {
                    const relationCollection = schema.collections[field.collection]
                    if (!record[breadcrumb]) continue
                    recordMap[breadcrumb] = {
                        title: (Object.values(record[breadcrumb])[0] as StokerRelation)[titleField],
                        collection: relationCollection,
                        record: {
                            ...(Object.values(record[breadcrumb])[0] as StokerRelation),
                            id: record[`${breadcrumb}_Array`][0],
                        },
                    }
                } else {
                    const relationCollection = schema.collections[field.collection]
                    const { recordTitleField } = relationCollection
                    if (record[`${field.name}_Array`]?.length) {
                        const id = record[`${field.name}_Array`][0]
                        const relationRecord = record[field.name][id]
                        if (relationRecord) {
                            recordMap[breadcrumb] = {
                                title: relationRecord[recordTitleField],
                                collection: relationCollection,
                                record: { ...relationRecord, id },
                            }
                        }
                    }
                }
            }
            return recordMap
        }, [breadcrumbs, record])

    if (!filteredBreadcrumbs?.length || Object.keys(records).length !== filteredBreadcrumbs.length) return null

    return (
        <Breadcrumb>
            <BreadcrumbList>
                {filteredBreadcrumbs?.map((breadcrumb) => (
                    <Fragment key={breadcrumb.key}>
                        <BreadcrumbItem>
                            <BreadcrumbLink className="break-all whitespace-pre-wrap overflow-x-auto" asChild>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() =>
                                        goToRecord(
                                            records[breadcrumb.key].collection,
                                            records[breadcrumb.key].record as StokerRecord,
                                            breadcrumb.field,
                                        )
                                    }
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            goToRecord(
                                                records[breadcrumb.key].collection,
                                                records[breadcrumb.key].record as StokerRecord,
                                                breadcrumb.field,
                                            )
                                        }
                                    }}
                                >
                                    {`${breadcrumb.label}:`}{" "}
                                    <span className="text-blue-500 hover:underline">
                                        {records[breadcrumb.key].title}
                                    </span>
                                </div>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                    </Fragment>
                ))}
                <BreadcrumbItem>
                    <BreadcrumbPage className="break-all whitespace-pre-wrap overflow-x-auto">
                        {record[recordTitleField]}
                    </BreadcrumbPage>
                </BreadcrumbItem>
            </BreadcrumbList>
        </Breadcrumb>
    )

    /* eslint-enable security/detect-object-injection */
}

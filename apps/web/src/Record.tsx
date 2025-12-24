import {
    CollectionSchema,
    CustomRecordPage,
    RelationField,
    StokerCollection,
    StokerRecord,
} from "@stoker-platform/types"
import { SidebarProvider } from "./components/ui/sidebar"
import { RecordForm } from "./Form"
import { Route, Routes, useLocation, useNavigate, useParams } from "react-router"
import { RecordSidebar } from "./RecordSidebar"
import { createElement, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent } from "./components/ui/card"
import { getCachedConfigValue, getField, getFieldCustomization, tryPromise } from "@stoker-platform/utils"
import {
    deserializeTimestamps,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getOne,
    getSchema,
    subscribeOne,
} from "@stoker-platform/web-client"
import { getCapitalisedPath } from "./utils/getCapitalizedPath"
import { Button } from "./components/ui/button"
import { ChevronLeft } from "lucide-react"
import { RecordFiles } from "./Files"
import { runViewTransition } from "./utils/runViewTransition"
import { serverReadOnly } from "./utils/serverReadOnly"
import { useRouteLoading } from "./providers/LoadingProvider"
import { getRelationFields } from "./utils/getRelationFields"
import { FiltersProvider } from "./providers/FiltersProvider"
import Collection from "./Collection"
import { Breadcrumbs } from "./Breadcrumbs"
import { Separator } from "./components/ui/separator"

export const Record = ({ collection }: { collection: CollectionSchema }) => {
    const { labels, fields, recordTitleField } = collection
    const { path: pathString, id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const permissions = getCurrentUserPermissions()

    const recordFromState: StokerRecord | undefined = useMemo(() => {
        if (location?.state?.record) {
            const recordClone = { ...location.state.record }
            for (const field of fields) {
                if (field.type === "Embedding") {
                    delete recordClone[field.name]
                }
            }
            return recordClone
        }
    }, [location?.state?.record, fields])
    window.history.replaceState(null, "", location.pathname)

    const fromRelationList = useRef(location.state?.relationList)

    if (!pathString) {
        throw new Error("Path param is required")
    }
    if (!id) {
        throw new Error("ID param is required")
    }
    const path = getCapitalisedPath(pathString)
    const schema = getSchema(true)
    const customization = getCollectionConfigModule(labels.collection)
    const titleField = getField(fields, recordTitleField)
    const titleFieldCustomization = getFieldCustomization(titleField, customization)
    const isServerReadOnly = serverReadOnly(collection)
    const { setIsRouteLoading } = useRouteLoading()
    const isLoading = useRef(true)
    const [record, setRecord] = useState<StokerRecord | undefined>(
        location?.state?.relationField?.includeFields ? undefined : recordFromState,
    )
    const recordInitialised = useRef(false)
    // eslint-disable-next-line security/detect-object-injection
    const [recordTitle, setRecordTitle] = useState<string | undefined>(recordFromState?.[recordTitleField])
    const [icon, setIcon] = useState<React.ElementType | undefined>(undefined)
    const [breadcrumbs, setBreadcrumbs] = useState<string[] | undefined>(undefined)
    const [customRecordPages, setCustomRecordPages] = useState<CustomRecordPage[] | undefined>(undefined)

    useEffect(() => {
        if (id && record && record.id !== id) {
            setRecord(location?.state?.relationField?.includeFields ? undefined : recordFromState)
            // eslint-disable-next-line security/detect-object-injection
            setRecordTitle(recordFromState?.[recordTitleField])
            recordInitialised.current = false
            isLoading.current = true
        }
    }, [id])

    useEffect(() => {
        let unsubscribe: (() => void) | undefined = undefined
        let isMounted = true
        const initialize = async () => {
            const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                "collections",
                labels.collection,
                "admin",
            ]
            const liveUpdate = await getCachedConfigValue(customization, [...collectionAdminPath, "live"])
            const fieldLiveUpdate = await tryPromise(titleFieldCustomization?.admin?.live)
            const icon = await getCachedConfigValue(customization, [...collectionAdminPath, "icon"])
            setIcon(icon)
            const breadcrumbs = await getCachedConfigValue(customization, [...collectionAdminPath, "breadcrumbs"])
            setBreadcrumbs(breadcrumbs)
            const pages = (await getCachedConfigValue(customization, [...collectionAdminPath, "customRecordPages"])) as
                | CustomRecordPage[]
                | undefined
            setCustomRecordPages(pages || [])

            setIsRouteLoading("+", location.pathname)

            const relationFields = getRelationFields(collection)

            if (id) {
                if (!isServerReadOnly) {
                    unsubscribe = await subscribeOne(
                        path,
                        id,
                        async (data) => {
                            if (!data) {
                                setRecord(undefined)
                                return
                            }
                            if (!recordInitialised.current || liveUpdate || fieldLiveUpdate) {
                                recordInitialised.current = true
                                // eslint-disable-next-line security/detect-object-injection
                                setRecordTitle(data[recordTitleField])
                            }
                            setRecord(data)
                            setIsRouteLoading("-", location.pathname)
                            isLoading.current = false
                        },
                        (error) => {
                            if (isMounted) {
                                console.error(error)
                            }
                        },
                        {
                            noEmbeddingFields: true,
                            relations: { fields: relationFields },
                        },
                    )
                } else {
                    const data = await getOne(path, id, {
                        noEmbeddingFields: true,
                        relations: {
                            depth: 1,
                            fields: relationFields,
                        },
                    })
                    if (!data) {
                        setRecord(undefined)
                        return
                    }
                    deserializeTimestamps(data)
                    // eslint-disable-next-line security/detect-object-injection
                    setRecordTitle(data[recordTitleField])
                    setRecord(data)
                    setIsRouteLoading("-", location.pathname)
                    isLoading.current = false
                }
            }
        }
        initialize()
        return () => {
            isMounted = false
            unsubscribe?.()
        }
    }, [id])

    return (
        <div className="flex flex-col lg:gap-4 lg:pt-4">
            <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background px-4 py-1 lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-6 lg:py-0 print:border-none select-none">
                <Card className="mr-4 hover:bg-muted">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            runViewTransition(() => navigate(-1))
                        }}
                        className="h-8 w-8 hover:bg-transparent"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                </Card>
                <Card className="flex items-center gap-2 h-12 min-w-[300px] p-5">
                    <div>{icon ? createElement(icon) : null}</div>
                    <h1 className="truncate">{recordTitle}</h1>
                </Card>
            </header>
            <main className="grid flex-1 items-start gap-4 p-4 lg:px-6 lg:py-0 md:gap-8">
                <Card className="min-h-screen xl:min-h-full xl:h-[calc(100vh-160px)]">
                    {record && (
                        <CardContent className="px-0">
                            <SidebarProvider defaultOpen={true} open={true} className="flex flex-col lg:flex-row">
                                <RecordSidebar collection={collection} customRecordPages={customRecordPages} />
                                <Routes>
                                    <Route
                                        path="edit"
                                        element={
                                            <main className="p-4 w-full overflow-y-auto min-h-screen xl:min-h-full xl:h-[calc(100vh-160px)]">
                                                <RecordForm
                                                    collection={collection}
                                                    operation="update"
                                                    path={path}
                                                    record={record}
                                                    isLoading={isLoading}
                                                    fromRelationList={fromRelationList.current}
                                                />
                                            </main>
                                        }
                                    />
                                    {collection.relationLists?.map((relationList) => {
                                        const relationCollection = schema.collections[relationList.collection]
                                        if (!relationCollection) return null
                                        if (
                                            relationList.roles &&
                                            !(permissions?.Role && relationList.roles?.includes(permissions?.Role))
                                        )
                                            return null

                                        const hasBreadcrumbs = !!breadcrumbs?.filter((breadcrumb) => {
                                            const field = getField(fields, breadcrumb) as RelationField
                                            return field && record?.[`${field.name}_Array`]?.length
                                        })?.length

                                        return (
                                            <Route
                                                key={`${relationList.collection}-${relationList.field}`}
                                                path={relationList.collection.toLowerCase()}
                                                element={
                                                    <main className="w-full overflow-y-auto min-h-screen xl:min-h-full xl:h-[calc(100vh-160px)]">
                                                        <FiltersProvider
                                                            key={`${relationList.collection}-filters`}
                                                            collection={relationCollection}
                                                        >
                                                            {hasBreadcrumbs && record && (
                                                                <>
                                                                    <div className="p-4">
                                                                        <div className="mb-5">
                                                                            <Breadcrumbs
                                                                                breadcrumbs={breadcrumbs}
                                                                                collection={collection}
                                                                                record={record}
                                                                            />
                                                                        </div>
                                                                        <Separator />
                                                                    </div>
                                                                </>
                                                            )}
                                                            <Collection
                                                                key={`${relationList.collection}-collection`}
                                                                collection={relationCollection}
                                                                relationList={relationList}
                                                                relationCollection={collection}
                                                                relationParent={record}
                                                                additionalConstraints={(() => {
                                                                    if (record) {
                                                                        return [
                                                                            [
                                                                                `${relationList.field}_Array`,
                                                                                "array-contains",
                                                                                record.id,
                                                                            ],
                                                                        ]
                                                                    }
                                                                    return []
                                                                })()}
                                                            />
                                                        </FiltersProvider>
                                                    </main>
                                                }
                                            />
                                        )
                                    })}
                                    <Route
                                        path="files"
                                        element={
                                            <main className="p-4 w-full overflow-y-auto min-h-screen xl:min-h-full xl:h-[calc(100vh-160px)]">
                                                <RecordFiles collection={collection} record={record} />
                                            </main>
                                        }
                                    />
                                    {customRecordPages?.map((page) => (
                                        <Route
                                            key={`custom-page-${page.url}`}
                                            path={page.url}
                                            element={
                                                <main className="p-4 w-full overflow-y-auto min-h-screen xl:min-h-full xl:h-[calc(100vh-160px)]">
                                                    {createElement(page.component, {
                                                        record,
                                                        collection,
                                                        components: import.meta.glob("./components/ui/*.tsx", {
                                                            eager: true,
                                                        }),
                                                        hooks: import.meta.glob("./hooks/*.{ts,tsx}", { eager: true }),
                                                        utils: import.meta.glob("./lib/*.{ts,tsx}", { eager: true }),
                                                    })}
                                                </main>
                                            }
                                        />
                                    ))}
                                    <Route
                                        path="*"
                                        element={
                                            <main className="p-4 w-full overflow-y-auto min-h-screen xl:min-h-full xl:h-[calc(100vh-160px)]">
                                                <RecordForm
                                                    collection={collection}
                                                    operation="update"
                                                    path={path}
                                                    record={record}
                                                    isLoading={isLoading}
                                                    fromRelationList={fromRelationList.current}
                                                />
                                            </main>
                                        }
                                    />
                                </Routes>
                            </SidebarProvider>
                        </CardContent>
                    )}
                </Card>
            </main>
        </div>
    )
}

import { FileIcon, EditIcon, List as ListIcon, Book, ArrowDown, Pencil, List } from "lucide-react"
import {
    Sidebar,
    SidebarContent,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenu,
    SidebarGroup,
    SidebarGroupContent,
} from "./components/ui/sidebar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu"
import { useLocation, useNavigate, useParams } from "react-router"
import { Assignable, CollectionPermissions, CollectionSchema, CustomRecordPage } from "@stoker-platform/types"
import { collectionAccess, getField, isRelationField, tryFunction, tryPromise } from "@stoker-platform/utils"
import { getCurrentUserPermissions, getCollectionConfigModule, getSchema } from "@stoker-platform/web-client"
import { runViewTransition } from "./utils/runViewTransition"
import { useEffect, useState } from "react"

interface SidebarItem {
    title: string
    page: string
    icon: React.FC
    assignable?: Assignable
}

export const RecordSidebar = ({
    collection,
    customRecordPages,
    isAssigning,
    setIsAssigning,
}: {
    collection: CollectionSchema
    customRecordPages?: CustomRecordPage[]
    isAssigning: Record<string, boolean>
    setIsAssigning: (isAssigning: Record<string, boolean>) => void
}) => {
    const { labels } = collection
    const { path, id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()

    const schema = getSchema()
    const customization = getCollectionConfigModule(collection.labels.collection)
    const permissions = getCurrentUserPermissions()
    const [relationTitles, setRelationTitles] = useState<Record<string, string>>({})
    const [relationIcons, setRelationIcons] = useState<Record<string, React.FC>>({})
    const [assignable, setAssignable] = useState<Assignable[]>([])
    const [isInitialized, setIsInitialized] = useState(false)

    useEffect(() => {
        ;(async () => {
            if (collection.relationLists) {
                collection.relationLists.forEach(async (relationList) => {
                    const relationCollection = schema.collections[relationList.collection]
                    if (!relationCollection) return
                    const relationCustomization = getCollectionConfigModule(relationCollection.labels.collection)
                    const titles = await tryPromise(relationCustomization.admin?.titles)
                    const title = titles?.collection || relationList.collection
                    setRelationTitles((prev) => ({
                        ...prev,
                        [relationList.collection]: title || relationList.collection,
                    }))
                    const icon = await tryPromise(relationCustomization.admin?.icon)
                    setRelationIcons((prev) => ({
                        ...prev,
                        [relationList.collection]: icon as React.FC,
                    }))
                })
                const assignable = await tryPromise(customization.admin?.assignable)
                setAssignable(assignable)
            }
            setIsInitialized(true)
        })()
    }, [])

    const editItem = [
        {
            title: "Edit",
            page: "edit",
            icon: EditIcon,
        },
    ]
    const filesItem = [
        {
            title: "Files",
            page: "files",
            icon: FileIcon,
        },
    ]

    const customItems: SidebarItem[] = []
    if (customRecordPages && customRecordPages.length > 0) {
        for (const page of customRecordPages) {
            const show = page.condition === undefined || tryFunction(page.condition)
            if (show) {
                customItems.push({ title: page.title, page: page.url, icon: (page.icon as React.FC) || Book })
            }
        }
    }

    const relationItems: SidebarItem[] = []

    if (collection.relationLists && id) {
        collection.relationLists.forEach((relationList) => {
            const relationCollection = schema.collections[relationList.collection]
            if (!collectionAccess("Read", permissions?.collections?.[relationList.collection] as CollectionPermissions))
                return
            const field = getField(relationCollection.fields, relationList.field)
            if (!field || !isRelationField(field)) return
            if (!permissions?.Role) return
            if (relationList.roles && !relationList.roles.includes(permissions.Role)) return
            relationItems.push({
                title: relationTitles[relationList.collection],
                page: relationList.collection.toLowerCase(),
                icon: relationIcons[relationList.collection] || (() => null),
                assignable: assignable?.find((item) => item.collection === relationList.collection),
            })
        })
    }

    const goToRecordPage = (page: string) => {
        if (location.pathname === `/${labels.record.toLowerCase()}/${path}/${id}/${page}`) {
            return
        }
        runViewTransition(() => navigate(`/${labels.record.toLowerCase()}/${path}/${id}/${page}`))
    }

    const anyCustomActive = customItems.some((item) => location.pathname.includes(item.page))
    const anyRelationActive = relationItems.some((item) => location.pathname.includes(item.page))

    if (!isInitialized) return null

    return (
        <Sidebar
            collapsible="none"
            className="flex-shrink-0 flex-grow-0 rounded-tr-xl rounded-tl-xl w-12 w-full lg:w-48 lg:rounded-br-xl lg:rounded-tr-none"
        >
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu className="flex">
                            <div className="hidden lg:flex flex-col gap-1">
                                {[...editItem, ...relationItems, ...filesItem, ...customItems].map(
                                    (item: SidebarItem) => {
                                        const isActive = location.pathname.includes(item.page)
                                        return (
                                            <SidebarMenuItem key={item.page}>
                                                <SidebarMenuButton asChild onClick={() => goToRecordPage(item.page)}>
                                                    <div className={isActive ? "bg-sidebar-accent" : "cursor-pointer"}>
                                                        <item.icon />
                                                        <button type="button">{item.title}</button>
                                                        {item.assignable && isActive && !isAssigning?.[item.page] && (
                                                            <button
                                                                className="ml-auto"
                                                                onClick={() =>
                                                                    setIsAssigning({
                                                                        ...isAssigning,
                                                                        [item.page]: true,
                                                                    })
                                                                }
                                                                type="button"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {item.assignable && isActive && isAssigning?.[item.page] && (
                                                            <button
                                                                className="ml-auto"
                                                                onClick={() =>
                                                                    setIsAssigning({
                                                                        ...isAssigning,
                                                                        [item.page]: false,
                                                                    })
                                                                }
                                                                type="button"
                                                            >
                                                                <List className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        )
                                    },
                                )}
                            </div>
                            <div className="lg:hidden flex flex-row gap-1">
                                {editItem.map((item: SidebarItem) => {
                                    const isActive = location.pathname.includes(item.page)
                                    return (
                                        <SidebarMenuItem key={item.page}>
                                            <SidebarMenuButton asChild onClick={() => goToRecordPage(item.page)}>
                                                <button
                                                    className={isActive ? "bg-sidebar-accent" : "cursor-pointer"}
                                                    type="button"
                                                >
                                                    <item.icon />
                                                    <span>{item.title}</span>
                                                </button>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )
                                })}
                                {relationItems.length > 0 && (
                                    <SidebarMenuItem key="related-dropdown">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <SidebarMenuButton asChild isActive={anyRelationActive}>
                                                    <button type="button" className="cursor-pointer">
                                                        <ListIcon />
                                                        <span>Related</span>
                                                    </button>
                                                </SidebarMenuButton>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start" className="w-56">
                                                {relationItems.map((item) => (
                                                    <DropdownMenuItem
                                                        key={item.page}
                                                        onClick={() => goToRecordPage(item.page)}
                                                    >
                                                        {item.title}

                                                        {item.assignable && !isAssigning?.[item.page] && (
                                                            <button
                                                                className="ml-auto"
                                                                onClick={() =>
                                                                    setIsAssigning({
                                                                        ...isAssigning,
                                                                        [item.page]: true,
                                                                    })
                                                                }
                                                                type="button"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {item.assignable && isAssigning?.[item.page] && (
                                                            <button
                                                                className="ml-auto"
                                                                onClick={() =>
                                                                    setIsAssigning({
                                                                        ...isAssigning,
                                                                        [item.page]: false,
                                                                    })
                                                                }
                                                                type="button"
                                                            >
                                                                <List className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </SidebarMenuItem>
                                )}
                                {filesItem.map((item: SidebarItem) => {
                                    const isActive = location.pathname.includes(item.page)
                                    return (
                                        <SidebarMenuItem key={item.page}>
                                            <SidebarMenuButton asChild onClick={() => goToRecordPage(item.page)}>
                                                <button
                                                    className={isActive ? "bg-sidebar-accent" : "cursor-pointer"}
                                                    type="button"
                                                >
                                                    <item.icon />
                                                    <span>{item.title}</span>
                                                </button>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )
                                })}
                                {customItems.length > 0 && (
                                    <SidebarMenuItem key="custom-dropdown">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <SidebarMenuButton asChild isActive={anyCustomActive}>
                                                    <button type="button" className="cursor-pointer">
                                                        <ArrowDown />
                                                        <span>More</span>
                                                    </button>
                                                </SidebarMenuButton>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start" className="w-56">
                                                {customItems.map((item) => (
                                                    <DropdownMenuItem
                                                        key={item.page}
                                                        onClick={() => goToRecordPage(item.page)}
                                                    >
                                                        {item.title}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </SidebarMenuItem>
                                )}
                            </div>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </Sidebar>
    )
}

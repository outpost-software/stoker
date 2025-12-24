import { FileIcon, EditIcon, List as ListIcon, Book, ArrowDown } from "lucide-react"
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
import { CollectionPermissions, CollectionSchema, CustomRecordPage } from "@stoker-platform/types"
import { collectionAccess, getField, isRelationField, tryFunction, tryPromise } from "@stoker-platform/utils"
import { getCurrentUserPermissions, getCollectionConfigModule, getSchema } from "@stoker-platform/web-client"
import { runViewTransition } from "./utils/runViewTransition"
import { useEffect, useState } from "react"

interface SidebarItem {
    title: string
    page: string
    icon: React.FC
}

export const RecordSidebar = ({
    collection,
    customRecordPages,
}: {
    collection: CollectionSchema
    customRecordPages?: CustomRecordPage[]
}) => {
    const { labels } = collection
    const { path, id } = useParams()
    const navigate = useNavigate()
    const location = useLocation()

    const schema = getSchema()
    const permissions = getCurrentUserPermissions()
    const [relationTitles, setRelationTitles] = useState<Record<string, string>>({})

    useEffect(() => {
        ;(async () => {
            if (collection.relationLists) {
                collection.relationLists.forEach(async (relationList) => {
                    const relationCollection = schema.collections[relationList.collection]
                    const relationCustomization = getCollectionConfigModule(relationCollection.labels.collection)
                    const titles = await tryPromise(relationCustomization.admin?.titles)
                    const title = titles?.collection || relationList.collection
                    setRelationTitles((prev) => ({
                        ...prev,
                        [relationList.collection]: title || relationList.collection,
                    }))
                })
            }
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
                icon: ListIcon,
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

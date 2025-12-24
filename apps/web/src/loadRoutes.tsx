import { CollectionSchema, DashboardItem } from "@stoker-platform/types"
import { collectionAccess, tryFunction } from "@stoker-platform/utils"
import { getCurrentUserPermissions, getGlobalConfigModule, getSchema } from "@stoker-platform/web-client"
import { Navigate, Outlet, RouteObject } from "react-router"
import Collection from "./Collection"
import ErrorPage from "./ErrorPage"
import { Record } from "./Record"
import App from "./App"
import { FiltersProvider } from "./providers/FiltersProvider"
import { Dashboard } from "./Dashboard"

export const loadRoutes = (): RouteObject[] => {
    const schema = getSchema(true)
    const permissions = getCurrentUserPermissions()
    if (!permissions?.collections || !permissions?.Role) return []
    const globalConfig = getGlobalConfigModule()
    const adminAccess = tryFunction(globalConfig.admin?.access)
    if (adminAccess && !adminAccess.includes(permissions.Role)) return []
    const collections = Object.values(schema.collections)
    const homePages = tryFunction(globalConfig.admin?.homePage)
    const dashboard = tryFunction(globalConfig.admin?.dashboard)
    const homePage = homePages?.[permissions.Role]
    const hasDashboard = dashboard?.some(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (item: DashboardItem) => !item.roles || item.roles?.includes(permissions.Role!),
    )

    const dynamicRoutes: RouteObject[] = []

    collections.forEach((collection: CollectionSchema) => {
        const { labels, parentCollection } = collection
        const collectionPermissions = permissions.collections?.[labels.collection]
        if (collectionPermissions && !parentCollection) {
            if (collectionAccess("Read", collectionPermissions)) {
                dynamicRoutes.push({
                    path: `/${labels.collection.toLowerCase()}`,
                    element: (
                        <FiltersProvider key={`${collection.labels.collection}-filters`} collection={collection}>
                            <Collection key={`${collection.labels.collection}-collection`} collection={collection} />
                        </FiltersProvider>
                    ),
                    errorElement: <ErrorPage />,
                })

                dynamicRoutes.push({
                    path: `/${labels.record.toLowerCase()}/:path/:id/*?`,
                    element: <Record key={`${collection.labels.collection}-record`} collection={collection} />,
                    errorElement: <ErrorPage />,
                    children: [
                        {
                            path: "edit",
                            element: <Outlet />,
                        },
                        {
                            path: "files",
                            element: <Outlet />,
                        },
                        {
                            path: "*",
                            element: <Outlet />,
                        },
                    ],
                })
            }
        }
    })

    const routes = [
        {
            path: "/",
            element: <App />,
            errorElement: <ErrorPage sentry />,
            children: [
                ...dynamicRoutes,
                {
                    path: "*",
                    element: <Navigate to="/" replace />,
                },
            ],
        },
    ]
    if (hasDashboard) {
        routes[0].children.unshift({
            index: true,
            element: <Dashboard />,
            errorElement: <ErrorPage />,
        })
    } else if (homePage) {
        routes[0].children.unshift({
            index: true,
            element: <Navigate to={`/${homePage.toLowerCase()}`} replace />,
            errorElement: <ErrorPage />,
        })
    } else {
        routes[0].children.unshift({
            index: true,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            element: <Navigate to={routes[0].children[0].path!} replace />,
            errorElement: <ErrorPage />,
        })
    }
    return routes
}

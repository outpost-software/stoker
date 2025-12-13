import { ChartBar } from "lucide-react"
import { Card } from "./components/ui/card"
import { StokerCollection, DashboardItem } from "@stoker-platform/types"
import { useEffect, useState } from "react"
import {
    getCachedConfigValue,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getGlobalConfigModule,
    getSchema,
} from "@stoker-platform/web-client"
import { DashboardMetric } from "./DashboardMetric"
import { DashboardChart } from "./DashboardChart"
import { preloadCacheEnabled } from "./utils/preloadCacheEnabled"
import { DashboardReminder } from "./DashboardReminder"
import { cn } from "./lib/utils"
import { Helmet } from "react-helmet"
import { getField } from "@stoker-platform/utils"

export const Dashboard = () => {
    const globalConfig = getGlobalConfigModule()
    const schema = getSchema(true)
    const permissions = getCurrentUserPermissions()
    if (!permissions?.Role) throw new Error("PERMISSION_DENIED")

    const [appName, setAppName] = useState()
    const [collectionTitles, setCollectionTitles] = useState<Record<StokerCollection, string | undefined>>({})
    const [metrics, setMetrics] = useState<DashboardItem[] | undefined>(undefined)

    useEffect(() => {
        const initialize = async () => {
            for (const collection of Object.values(schema.collections)) {
                const { labels } = collection
                const customization = getCollectionConfigModule(labels.collection)
                const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                    "collections",
                    labels.collection,
                    "admin",
                ]
                const appName = await getCachedConfigValue(globalConfig, ["global", "appName"])
                setAppName(appName)
                const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
                setCollectionTitles((prev) => ({ ...prev, [labels.collection]: titles?.collection }))
            }
            const metrics = await getCachedConfigValue(globalConfig, ["global", "admin", "dashboard"])
            setMetrics(metrics)
        }
        initialize()
    }, [])

    if (!metrics) return null

    return (
        <>
            <Helmet>
                <title>Dashboard</title>
                <meta name="description" content={`Dashboard for ${appName}`} />
            </Helmet>
            <div className="h-[100vh] xl:overflow-y-auto">
                <div className="flex flex-col lg:pt-4">
                    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background px-4 py-1 lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-6 lg:py-0 print:border-none select-none">
                        <Card className="flex items-center gap-2 h-12 sm:min-w-[300px] p-5">
                            <ChartBar />
                            <h1>Dashboard</h1>
                        </Card>
                    </header>
                    <main>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-8 mb-16">
                                {metrics
                                    ?.filter((dashboardItem) => {
                                        const collectionSchema = schema.collections[dashboardItem.collection]
                                        if (!collectionSchema) return null
                                        if ("field" in dashboardItem) {
                                            const field = getField(collectionSchema.fields, dashboardItem.field)
                                            if (!field) return false
                                        }
                                        if ("metricField1" in dashboardItem) {
                                            const field = getField(collectionSchema.fields, dashboardItem.metricField1)
                                            if (!field) return false
                                        }
                                        return true
                                    })
                                    .map((dashboardItem: DashboardItem, index: number) => {
                                        if (!schema.collections[dashboardItem.collection]) return null
                                        // eslint-disable-next-line security/detect-object-injection
                                        const collectionSchema = schema.collections[dashboardItem.collection]
                                        const isPreloadCacheEnabled = preloadCacheEnabled(collectionSchema)
                                        if (
                                            !(
                                                permissions?.Role &&
                                                (!dashboardItem.roles ||
                                                    dashboardItem.roles.includes(permissions?.Role))
                                            )
                                        )
                                            return null
                                        let cols = ""
                                        if (dashboardItem.kind === "metric") cols = "md:col-span-1"
                                        if (dashboardItem.kind === "chart") cols = "md:col-span-4"
                                        if (dashboardItem.kind === "reminder") cols = "lg:col-span-2"
                                        return (
                                            <div key={`dashboard-${index}`} className={cn("col-span-3", cols)}>
                                                {dashboardItem.kind === "metric" && isPreloadCacheEnabled && (
                                                    <DashboardMetric
                                                        key={`metric-${dashboardItem.collection}-${index}`}
                                                        metric={dashboardItem}
                                                        // eslint-disable-next-line security/detect-object-injection
                                                        title={collectionTitles[dashboardItem.collection]}
                                                        collection={dashboardItem.collection}
                                                    />
                                                )}
                                                {dashboardItem.kind === "chart" && isPreloadCacheEnabled && (
                                                    <DashboardChart
                                                        key={`metric-${dashboardItem.collection}-${index}`}
                                                        chart={dashboardItem}
                                                        // eslint-disable-next-line security/detect-object-injection
                                                        title={collectionTitles[dashboardItem.collection]}
                                                        collection={dashboardItem.collection}
                                                    />
                                                )}
                                                {dashboardItem.kind === "reminder" && (
                                                    <DashboardReminder
                                                        key={`metric-${dashboardItem.collection}-${index}`}
                                                        reminder={dashboardItem}
                                                        // eslint-disable-next-line security/detect-object-injection
                                                        title={collectionTitles[dashboardItem.collection]}
                                                        collection={dashboardItem.collection}
                                                    />
                                                )}
                                            </div>
                                        )
                                    })}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    )
}

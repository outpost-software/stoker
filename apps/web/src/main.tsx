import "./App.css"
import { StrictMode, useEffect, useState } from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import {
    createBrowserRouter,
    RouteObject,
    RouterProvider,
    createRoutesFromChildren,
    matchRoutes,
    useLocation,
    useNavigationType,
} from "react-router"
import { startStoker } from "./utils/startStoker"
import { loadRoutes } from "./loadRoutes"
import { Login } from "./Login"
import { onStokerReady } from "@stoker-platform/web-client"
import { ModeProvider, useMode } from "./providers/ModeProvider"
import { runViewTransition } from "./utils/runViewTransition"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import Maintenance from "./Maintenance"
import { DialogProvider, useDialog } from "./providers/DialogProvider"
import { CollectionSchema, DialogContent, StokerRecord } from "@stoker-platform/types"
import { ConnectionProvider, useConnection } from "./providers/ConnectionProvider"
import { callOpenCreateModal } from "./providers/CreateProvider"
import { GlobalLoadingProvider, useGlobalLoading } from "./providers/LoadingProvider"
import { useToast } from "./hooks/use-toast"
import * as Sentry from "@sentry/react"

Sentry.init({
    dsn: import.meta.env.STOKER_SENTRY_DSN,
    integrations: [
        Sentry.reactRouterV7BrowserTracingIntegration({
            useEffect,
            useLocation,
            useNavigationType,
            createRoutesFromChildren,
            matchRoutes,
        }),
    ],
    tracesSampleRate: 1.0,
})

const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV7(createBrowserRouter)

let initialized = false

const createRecordForm = (collection: CollectionSchema, collectionPath: string[], record?: StokerRecord) =>
    callOpenCreateModal(collection, collectionPath, record)

const start = async (context: {
    setMaintenance: (maintenance: boolean) => void
    setDialogContent: (dialogContent: DialogContent | null) => void
    setConnectionStatus: (connectionStatus: "online" | "offline") => void
    setGlobalLoading: (operation: "+" | "-", id: string, server?: boolean, cache?: boolean) => void
    createRecordForm: (
        collection: CollectionSchema,
        collectionPath: string[],
        record?: StokerRecord,
    ) => false | React.ReactPortal
    toast: ({
        title,
        description,
        variant,
        duration,
    }: {
        title: string
        description: string
        variant?: "default" | "destructive" | null | undefined
        duration?: number
    }) => void
}) => {
    return new Promise<boolean>((resolve) => {
        ;(async () => {
            const loggedIn = await startStoker(context)
            resolve(loggedIn)
        })()
    })
}

function Main() {
    const [mode, setMode] = useMode()
    const [maintenance, setMaintenance] = useState(false)
    const [routes, setRoutes] = useState<RouteObject[]>([])
    const { setGlobalLoading } = useGlobalLoading()
    const [, setConnectionStatus] = useConnection()
    const [, setDialogContent] = useDialog()
    const { toast } = useToast()

    useEffect(() => {
        if (mode === "maintenance") return
        const getRoutes = () => {
            const routes = loadRoutes()
            setRoutes(routes)
            runViewTransition(() => setMode("app"))
        }

        const initialize = async () => {
            if (!initialized) {
                initialized = true
                const loggedIn = await start({
                    setMaintenance,
                    setDialogContent,
                    setConnectionStatus,
                    setGlobalLoading,
                    createRecordForm,
                    toast,
                })
                const unsubscribe = onStokerReady(() => {
                    unsubscribe()
                    setMode("ready")
                })
                if (!loggedIn) {
                    runViewTransition(() => setMode("login"))
                    return
                }
            } else if (mode === "ready") {
                getRoutes()
                return
            }
        }
        initialize()
    }, [mode])

    if (maintenance) {
        return <Maintenance />
    } else if (mode === "login") {
        return <Login />
    } else if (mode === "app") {
        if (routes.length === 0) return null
        const router = sentryCreateBrowserRouter(routes)
        return <RouterProvider router={router} />
    } else {
        return (
            <div className="flex justify-center items-center h-screen relative bottom-8">
                <LoadingSpinner size={16} />
            </div>
        )
    }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
        <ModeProvider>
            <DialogProvider>
                <ConnectionProvider>
                    <GlobalLoadingProvider>
                        <Main />
                    </GlobalLoadingProvider>
                </ConnectionProvider>
            </DialogProvider>
        </ModeProvider>
    </StrictMode>,
)

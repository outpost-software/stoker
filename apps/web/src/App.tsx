import { ThemeProvider } from "./components/theme-provider"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import { RouteLoadingProvider } from "./providers/LoadingProvider"
import { OptimisticProvider } from "./providers/OptimisticProvider"
import { StateProvider } from "./providers/StateProvider"
import { CacheProvider } from "./providers/CacheProvider"
import { CreateProvider } from "./providers/CreateProvider"
import Tenant from "./Tenant"

function App() {
    return (
        <ThemeProvider defaultTheme="system" storageKey="stoker-vite-ui-theme">
            <DndProvider backend={HTML5Backend}>
                <RouteLoadingProvider>
                    <OptimisticProvider>
                        <StateProvider>
                            <CacheProvider>
                                <CreateProvider>
                                    <Tenant />
                                </CreateProvider>
                            </CacheProvider>
                        </StateProvider>
                    </OptimisticProvider>
                </RouteLoadingProvider>
            </DndProvider>
        </ThemeProvider>
    )
}

export default App

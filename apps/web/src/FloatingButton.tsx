import { useState } from "react"
import type { FloatingButton as FloatingButtonConfig } from "@stoker-platform/types"
import { getCurrentUserPermissions } from "@stoker-platform/web-client"
import { tryFunction } from "@stoker-platform/utils"
import { toast } from "./hooks/use-toast"
import { cn } from "./lib/utils"

export const FloatingButton = ({ config }: { config: FloatingButtonConfig }) => {
    const [isPending, setIsPending] = useState(false)
    const permissions = getCurrentUserPermissions()

    if (config.roles?.length && (!permissions?.Role || !config.roles.includes(permissions.Role))) return null
    if (config.condition && !tryFunction(config.condition)) return null

    return (
        <button
            type="button"
            className={cn(
                "fixed bottom-0 left-0 z-50 flex items-center justify-center rounded p-3 text-center text-sm font-semibold leading-tight text-white shadow-lg disabled:opacity-50",
                config.className,
            )}
            disabled={isPending}
            onClick={() => {
                setIsPending(true)
                Promise.resolve(config.action())
                    .catch((error: unknown) => {
                        console.error(error)
                        toast({
                            description: error instanceof Error ? error.message : "The action failed",
                            variant: "destructive",
                        })
                    })
                    .finally(() => setIsPending(false))
            }}
        >
            {config.text}
        </button>
    )
}

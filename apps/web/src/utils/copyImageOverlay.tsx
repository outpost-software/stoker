import { useCallback, useEffect, useRef, useState } from "react"
import { Copy } from "lucide-react"
import { Button } from "../components/ui/button"
import { cn } from "../lib/utils"
import { copyImageToClipboard } from "./copyImageToClipboard"
import { useToast } from "../hooks/use-toast"

const DELAY_MS = 1500

export const CopyImageOverlay = ({
    src,
    className,
    children,
}: {
    src: string
    className?: string
    children: React.ReactNode
}) => {
    const { toast } = useToast()
    const [revealed, setRevealed] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    useEffect(() => () => clearTimer(), [clearTimer])

    const handleMouseEnter = useCallback(() => {
        clearTimer()
        timerRef.current = setTimeout(() => setRevealed(true), DELAY_MS)
    }, [clearTimer])

    const handleMouseLeave = useCallback(() => {
        clearTimer()
        setRevealed(false)
    }, [clearTimer])

    const handleCopy = useCallback(
        async (event: React.MouseEvent) => {
            event.stopPropagation()
            event.preventDefault()
            try {
                await copyImageToClipboard(src)
                toast({ title: "Image copied", description: "The image has been copied to the clipboard" })
            } catch {
                toast({
                    title: "Copy failed",
                    description: "Could not copy the image to the clipboard",
                    variant: "destructive",
                })
            }
        },
        [src, toast],
    )

    return (
        <div className={cn("relative", className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            {children}
            <Button
                type="button"
                variant="secondary"
                size="icon"
                title="Copy image"
                tabIndex={revealed ? 0 : -1}
                className={cn(
                    "absolute top-1 right-1 z-10 transition-opacity",
                    revealed ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
                onClick={handleCopy}
            >
                <Copy className="w-4 h-4" />
            </Button>
        </div>
    )
}

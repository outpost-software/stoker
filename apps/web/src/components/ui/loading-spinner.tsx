import * as React from "react"
import { cn } from "@/lib/utils"
import { LoaderIcon } from "lucide-react"

const spinnerVariants: { [key: number]: string } = {
    4: "w-4 h-4 rounded-full animate-spin",
    7: "w-7 h-7 rounded-full animate-spin",
    16: "w-16 h-16 rounded-full animate-spin",
}

interface LoadingSpinnerProps extends React.HTMLAttributes<SVGSVGElement> {
    className?: string
    size: number
    dark?: boolean
}

const LoadingSpinner = React.forwardRef<SVGSVGElement, LoadingSpinnerProps>((props, ref) => {
    // eslint-disable-next-line prefer-const
    let { className, size, dark, ...rest } = props
    if (dark) {
        className = cn(className, "text-primary dark")
    }
    if (!size) return null
    // eslint-disable-next-line security/detect-object-injection
    return <LoaderIcon ref={ref} className={cn(spinnerVariants[size], className)} {...rest} />
})

LoadingSpinner.displayName = "LoadingSpinner"

export { LoadingSpinner }

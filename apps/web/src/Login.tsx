import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
    authenticateStoker,
    getCachedConfigValue,
    getGlobalConfigModule,
    onStokerReady,
} from "@stoker-platform/web-client"
import { useCallback, useEffect, useState, useRef } from "react"
import defaultLogo from "./assets/logo-large.png"
import { useMode } from "./providers/ModeProvider"
import { Terminal } from "lucide-react"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { Helmet } from "react-helmet"
import { MetaIcon } from "@stoker-platform/types"
import {
    Dialog,
    DialogFooter,
    DialogContent,
    DialogTitle,
    DialogHeader,
    DialogDescription,
} from "./components/ui/dialog"

export const description =
    "A login page with two columns. The first column has the login form with email and password. There's a Forgot your passwork link and a link to sign up if you do not have an account. The second column has a cover image."

export function Login() {
    const [, setMode] = useMode()
    const [isInitialized, setIsInitialized] = useState(false)
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [appName, setAppName] = useState<string | undefined>(undefined)
    const [logo, setLogo] = useState<string | undefined>(undefined)
    const [meta, setMeta] = useState<{ icons: MetaIcon[] | undefined } | undefined>(undefined)
    const [isPending, setIsPending] = useState(false)
    const [isError, setIsError] = useState(false)
    const [isQuota, setIsQuota] = useState(false)
    const [mfaDialogOpen, setMfaDialogOpen] = useState(false)
    const [mfaCode, setMfaCode] = useState("")
    const mfaCodeRef = useRef("")
    const [mfaError, setMfaError] = useState("")
    const mfaPromiseRef = useRef<{ resolve: (code: string) => void; reject: (err: Error) => void } | null>(null)

    const globalConfig = getGlobalConfigModule()

    useEffect(() => {
        const initialize = async () => {
            const appName = await getCachedConfigValue(globalConfig, ["global", "appName"])
            setAppName(appName)
            const logo = await getCachedConfigValue(globalConfig, ["global", "admin", "logo", "login"])
            setLogo(logo)
            const meta = await getCachedConfigValue(globalConfig, ["global", "admin", "meta"])
            setMeta(meta)
            setIsInitialized(true)
        }
        initialize()

        const elements = document.querySelectorAll(".dark")
        elements.forEach((element) => {
            element.classList.remove("dark")
        })
    }, [])

    const getMultiFactorTOTP = useCallback(async () => {
        setMfaCode("")
        mfaCodeRef.current = ""
        setMfaError("")
        setMfaDialogOpen(true)
        return new Promise<string>((resolve, reject) => {
            mfaPromiseRef.current = { resolve, reject }
        })
    }, [])

    const handleSubmit = useCallback(
        async (event: React.FormEvent) => {
            event.preventDefault()
            setIsPending(true)
            setIsError(false)
            setIsQuota(false)
            await authenticateStoker(email, password, getMultiFactorTOTP).catch((error) => {
                if (error.code === "auth/quota-exceeded" || error.code === "auth/too-many-requests") {
                    setIsQuota(true)
                } else {
                    setIsError(true)
                }
                setIsPending(false)
            })
            setEmail("")
            setPassword("")
            const unsubscribe = onStokerReady(() => {
                unsubscribe()
                setMode("ready")
                setIsPending(false)
                setIsError(false)
                setIsQuota(false)
            })
        },
        [email, password],
    )

    return (
        <>
            <Helmet>
                <title>Login</title>
                <meta name="description" content={`Log in to your ${appName} account`} />
                {meta?.icons ? (
                    meta.icons.map((icon) => <link key={icon.rel} rel={icon.rel} type={icon.type} href={icon.url} />)
                ) : (
                    <link key="favicon" rel="icon" type="image/png" href="./favicon.ico" />
                )}
            </Helmet>
            <div className="w-full lg:grid lg:min-h-[600px] lg:grid-cols-2 xl:min-h-[800px] bg-background">
                <div className="flex items-center justify-center py-12">
                    <div className="mx-auto grid w-[350px] gap-6">
                        <div className="grid gap-2 text-center">
                            <h1 className="text-3xl font-bold">Login</h1>
                            <p className="text-balance text-muted-foreground">
                                Enter your email below to log in to your account
                            </p>
                        </div>
                        <form onSubmit={handleSubmit} className="grid gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    autoComplete="email"
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">Password</Label>
                                    {/* <Link
                    to="/forgot-password"
                    className="ml-auto inline-block text-sm underline"
                    >
                    Forgot your password?
                    </Link> */}
                                </div>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={isPending}>
                                {!isPending ? "Login" : <LoadingSpinner size={7} />}
                            </Button>
                            {/* <Button variant="outline" className="w-full">
                Login with Google
                </Button> */}
                        </form>
                        {/* <div className="mt-4 text-center text-sm">
                Don&apos;t have an account?{" "}
                <Link to="#" className="underline">
                Sign up
                </Link>
            </div> */}
                        {isError && (
                            <div>
                                <Alert variant="destructive">
                                    <Terminal className="h-4 w-4" />
                                    <AlertTitle>Invalid login details</AlertTitle>
                                    <AlertDescription>
                                        The email or password you entered is incorrect. Please try again.
                                    </AlertDescription>
                                </Alert>
                            </div>
                        )}
                        {isQuota && (
                            <div>
                                <Alert variant="destructive">
                                    <Terminal className="h-4 w-4" />
                                    <AlertTitle>Too many attempts</AlertTitle>
                                    <AlertDescription>
                                        You have exceeded the maximum number of login attempts. Please try again later.
                                    </AlertDescription>
                                </Alert>
                            </div>
                        )}
                        <Dialog
                            open={mfaDialogOpen}
                            onOpenChange={(open) => {
                                if (!open) {
                                    mfaPromiseRef.current?.reject(new Error("User cancelled MFA input"))
                                }
                                setMfaDialogOpen(open)
                            }}
                        >
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Multi-Factor Authentication</DialogTitle>
                                    <DialogDescription>
                                        Enter the 6-digit code from your authenticator app.
                                    </DialogDescription>
                                </DialogHeader>
                                <Input
                                    id="mfa-code"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{6}"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={mfaCode}
                                    onChange={(e) => {
                                        const value = e.target.value.replace(/[^0-9]/g, "")
                                        setMfaCode(value)
                                        mfaCodeRef.current = value
                                        setMfaError("")
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault()
                                            if (!/^\d{6}$/.test(mfaCodeRef.current)) {
                                                setMfaError("Please enter a valid 6-digit code.")
                                                return
                                            }
                                            setMfaDialogOpen(false)
                                            mfaPromiseRef.current?.resolve(mfaCodeRef.current)
                                        }
                                    }}
                                    className="text-center w-32"
                                />
                                {mfaError && <div className="text-destructive text-xs">{mfaError}</div>}
                                <DialogFooter>
                                    <div className="flex gap-2 justify-end">
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setMfaDialogOpen(false)
                                                mfaPromiseRef.current?.reject(new Error("User cancelled MFA input"))
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                if (!/^\d{6}$/.test(mfaCodeRef.current)) {
                                                    setMfaError("Please enter a valid 6-digit code.")
                                                    return
                                                }
                                                setMfaDialogOpen(false)
                                                mfaPromiseRef.current?.resolve(mfaCodeRef.current)
                                            }}
                                        >
                                            Confirm
                                        </Button>
                                    </div>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
                <div className="hidden bg-muted lg:block">
                    {isInitialized && (
                        <img
                            src={logo || defaultLogo}
                            alt="Logo"
                            width="1920"
                            height="1080"
                            className="h-full w-full object-contain dark:brightness-[0.2] dark:grayscale"
                        />
                    )}
                </div>
            </div>
        </>
    )
}

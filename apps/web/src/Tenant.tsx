import {
    getCachedConfigValue,
    getCollectionConfigModule,
    getCurrentUserPermissions,
    getGlobalConfigModule,
    getSchema,
    multiFactorEnroll,
    onStokerSignOut,
    signOut,
} from "@stoker-platform/web-client"
import "./App.css"
import { createElement, Suspense, useMemo, useEffect, useState, useCallback, useRef } from "react"
import { Outlet, useNavigate, useLocation } from "react-router"
import { collectionAccess, tryFunction } from "@stoker-platform/utils"
import { Background, CollectionSchema, MenuGroup, MetaIcon, StokerCollection } from "@stoker-platform/types"
import { useMode } from "./providers/ModeProvider"
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
} from "./components/ui/dropdown-menu"
import defaultLogo from "./assets/logo-small.png"
import { ModeToggle } from "./components/ui/mode-toggle"
import { ChevronsUpDown, PanelLeft, Search, ChartBar, User } from "lucide-react"
import { runViewTransition } from "./utils/runViewTransition"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "./components/ui/button"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { useGlobalLoading, useRouteLoading } from "./providers/LoadingProvider"
import { Badge } from "./components/ui/badge"
import { cn } from "./lib/utils"
import { Input } from "./components/ui/input"
import { Toaster } from "./components/ui/toaster"
import { useCache } from "./providers/CacheProvider"
import { SearchAll } from "./SearchAll"
import { Popover, PopoverTrigger } from "./components/ui/popover"
import { Helmet } from "react-helmet"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./components/ui/dialog"
import { useDialog } from "./providers/DialogProvider"
import { useConnection } from "./providers/ConnectionProvider"
import { getAuth, multiFactor } from "firebase/auth"
import { QRCodeSVG } from "qrcode.react"
import { getFunctions, httpsCallable } from "firebase/functions"
import { getApp } from "firebase/app"
import { useTheme } from "./components/theme-provider"

function Tenant() {
    const [dialogContent, setDialogContent] = useDialog()
    const location = useLocation()
    const navigate = useNavigate()
    const globalConfig = getGlobalConfigModule()
    const schema = getSchema()
    const permissions = getCurrentUserPermissions()
    const collections = Object.entries(schema.collections)
    const app = getApp()
    const auth = getAuth()
    const user = auth.currentUser
    if (!user) throw new Error("PERMISSION_DENIED")

    const enableMfa = useMemo(() => {
        return (
            (typeof globalConfig.auth.enableMultiFactorAuth === "boolean" && globalConfig.auth.enableMultiFactorAuth) ||
            (typeof globalConfig.auth.enableMultiFactorAuth === "object" &&
                permissions?.Role &&
                globalConfig.auth.enableMultiFactorAuth.includes(permissions?.Role))
        )
    }, [user])

    const mfaActive = useMemo(() => {
        return enableMfa && multiFactor(user).enrolledFactors.some((factor) => factor.factorId === "totp")
    }, [user])

    const [, setMode] = useMode()
    const { theme } = useTheme()
    const { isGlobalLoading, isGlobalCachePending } = useGlobalLoading()
    const { isRouteLoading, setIsRouteLoading } = useRouteLoading()
    const [connectionStatus] = useConnection()
    const [appName, setAppName] = useState("")
    const [meta, setMeta] = useState<{ icons: MetaIcon[] | undefined; description: string } | undefined>(undefined)
    const [collectionTitles, setCollectionTitles] = useState<{ [key: string]: string }>({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [iconNames, setIconNames] = useState<{ [collection: StokerCollection]: any }>({})
    const [navbarMenu, setNavbarMenu] = useState<MenuGroup[]>([])
    const [sidebarMenu, setSidebarMenu] = useState<MenuGroup[]>([])
    const [logo, setLogo] = useState<string | undefined>(undefined)
    const [search, setSearch] = useState<string>("")
    const [searchFocused, setSearchFocused] = useState(false)
    const [background, setBackground] = useState<Background | undefined>(undefined)

    const { unsubscribe } = useCache()

    const isGlobalLoadingRef = useRef(isGlobalLoading.size)
    const isGlobalCachePendingRef = useRef(isGlobalCachePending.size)
    useEffect(() => {
        isGlobalLoadingRef.current = isGlobalLoading.size
    }, [isGlobalLoading.size])
    useEffect(() => {
        isGlobalCachePendingRef.current = isGlobalCachePending.size
    }, [isGlobalCachePending.size])

    useEffect(() => {
        const getConfig = async () => {
            const appName = await getCachedConfigValue(globalConfig, ["global", "appName"])
            setAppName(appName)
            const meta = await getCachedConfigValue(globalConfig, ["global", "admin", "meta"])
            setMeta(meta)
            const background = tryFunction(globalConfig.admin?.background)
            setBackground(background)
            const titles: { [key: string]: StokerCollection } = {}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const icons: { [key: string]: any } = {}
            const collectionsGrouped: StokerCollection[] = []

            const hasCollectionAccess = (collection: CollectionSchema) => {
                if (!collection) return false
                const { labels, parentCollection } = collection
                if (parentCollection) return false
                if (!permissions?.collections) return false
                const collectionPermissions = permissions.collections?.[labels.collection]
                if (!collectionPermissions) return false

                return collectionAccess("Read", collectionPermissions)
            }

            const navbarMenu = []
            const sidebarMenu = []

            let groups = await getCachedConfigValue(globalConfig, ["global", "admin", "menu", "groups"])
            if (groups) {
                groups = groups.filter(
                    (group: MenuGroup) => permissions?.Role && (!group.roles || group.roles.includes(permissions.Role)),
                )
                groups.sort((a: MenuGroup, b: MenuGroup) => a.position - b.position)
                for (const group of groups) {
                    group.collections = group.collections.filter((collection: string) => {
                        // eslint-disable-next-line security/detect-object-injection
                        const collectionSchema = schema.collections[collection]
                        return hasCollectionAccess(collectionSchema)
                    })
                    navbarMenu.push(group)
                    collectionsGrouped.push(...group.collections)
                }
            }
            for (const [collectionName, collection] of collections) {
                const customization = getCollectionConfigModule(collectionName)
                const navbarPosition = await getCachedConfigValue(customization, [
                    "collections",
                    collectionName,
                    "admin",
                    "navbarPosition",
                ])
                const hidden = await getCachedConfigValue(customization, [
                    "collections",
                    collectionName,
                    "admin",
                    "hidden",
                ])
                if (hidden) continue
                if (collection.parentCollection) continue

                sidebarMenu.push({
                    title: collectionName,
                    collections: [collectionName],
                    position: navbarPosition || 0,
                })

                if (!collectionsGrouped.includes(collectionName)) {
                    if (!hasCollectionAccess(collection)) continue
                    navbarMenu.push({
                        title: collectionName,
                        collections: [collectionName],
                        position: navbarPosition || 0,
                    })
                }

                const collectionTitles = await getCachedConfigValue(customization, [
                    "collections",
                    collectionName,
                    "admin",
                    "titles",
                ])
                // eslint-disable-next-line security/detect-object-injection
                titles[collectionName] = collectionTitles?.collection || collectionName
                const icon = await getCachedConfigValue(customization, ["collections", collectionName, "admin", "icon"])
                // eslint-disable-next-line security/detect-object-injection
                icons[collectionName] = icon
            }
            setCollectionTitles(titles)
            setIconNames(icons)
            const sortedNavbarMenu = navbarMenu.sort((a: MenuGroup, b: MenuGroup) => a.position - b.position)
            const sortedSidebarMenu = sidebarMenu.sort((a: MenuGroup, b: MenuGroup) => a.position - b.position)
            setNavbarMenu(sortedNavbarMenu)
            setSidebarMenu(sortedSidebarMenu)

            const logo = await getCachedConfigValue(globalConfig, ["global", "admin", "logo", "navbar"])
            setLogo(logo)
        }
        getConfig()

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (isGlobalLoadingRef.current > 0 || isGlobalCachePendingRef.current > 0) {
                event.preventDefault()
            }
        }

        window.addEventListener("beforeunload", handleBeforeUnload)

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload)
            unsubscribe()
        }
    }, [])

    useEffect(() => {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
        if (background) {
            if (theme === "light") {
                document.body.style.backgroundColor = background?.light?.color || "transparent"
                document.body.style.backgroundImage = background?.light?.image || "none"
            } else if (theme === "dark") {
                document.body.style.backgroundColor = background?.dark?.color || "transparent"
                document.body.style.backgroundImage = background?.dark?.image || "none"
            } else if (prefersDark) {
                document.body.style.backgroundColor = background?.dark?.color || "transparent"
                document.body.style.backgroundImage = background?.dark?.image || "none"
            } else {
                document.body.style.backgroundColor = background?.light?.color || "transparent"
                document.body.style.backgroundImage = background?.light?.image || "none"
            }
        } else {
            if (theme === "dark") {
                document.body.style.backgroundColor = "#000000"
            } else if (theme === "light") {
                document.body.style.backgroundColor = "#ffffff"
            } else {
                document.body.style.backgroundColor = prefersDark ? "#000000" : "#ffffff"
            }
            document.body.style.backgroundImage = "none"
        }
    }, [background, theme])

    const prevPathname = useRef(location.pathname)

    useEffect(() => {
        if (prevPathname.current !== location.pathname) {
            setIsRouteLoading("-", prevPathname.current)
            prevPathname.current = location.pathname
        }
    }, [location.pathname])

    const isMatch = useCallback(
        (collection: StokerCollection) => {
            // eslint-disable-next-line security/detect-object-injection
            const collectionSchema = schema.collections[collection]
            const { labels } = collectionSchema
            return (
                location.pathname.startsWith(`/${labels.collection.toLowerCase()}`) ||
                location.pathname.startsWith(
                    `/create/${labels.record.toLowerCase()}/${labels.collection.toLowerCase()}`,
                ) ||
                location.pathname.startsWith(
                    `/update/${labels.record.toLowerCase()}/${labels.collection.toLowerCase()}`,
                )
            )
        },
        [location.pathname, schema.collections],
    )

    const [mfaDialog, setMfaDialog] = useState<null | {
        secret: string
        totpUri: string
        resolve: (code: string) => void
        reject: (err: Error) => void
    }>(null)
    const [mfaCode, setMfaCode] = useState("")
    const [mfaEnabled, setMfaEnabled] = useState(false)
    const [mfaRevoked, setMfaRevoked] = useState(false)
    const mfaCodeRef = useRef("")
    const [mfaError, setMfaError] = useState("")

    const getMultiFactorCode = useCallback(async (secret: string, totpUri: string) => {
        return new Promise<string>((resolve, reject) => {
            setMfaCode("")
            mfaCodeRef.current = ""
            setMfaError("")
            setMfaDialog({ secret, totpUri, resolve, reject })
            setDialogContent({
                title: "Enable Two-Factor Authentication",
                description:
                    "Scan the QR code below with your authenticator app, then enter the 6-digit code it generates.",
                disableClose: false,
                buttons: [
                    {
                        label: "Confirm",
                        onClick: () => {
                            if (!/^\d{6}$/.test(mfaCodeRef.current)) {
                                setMfaError("Please enter a valid 6-digit code.")
                                return
                            }
                            setDialogContent(null)
                            setMfaDialog(null)
                            setMfaEnabled(true)
                            resolve(mfaCodeRef.current)
                        },
                    },
                ],
            })
        })
    }, [])

    const links = useMemo(() => {
        const links = []
        for (const group of navbarMenu) {
            if (group.collections.length === 1) {
                const className = "flex h-full items-center text-primary dark"
                links.push(
                    <button
                        key={group.collections[0]}
                        className={
                            isMatch(group.collections[0])
                                ? className
                                : cn(className, "text-muted-foreground", "hover:text-foreground")
                        }
                        onClick={() => {
                            runViewTransition(() => navigate(`/${group.collections[0].toLowerCase()}`))
                        }}
                    >
                        {collectionTitles[group.collections[0]]}
                    </button>,
                )
            } else if (group.collections.length > 1) {
                const className = "block h-full cursor-pointer flex justify-between items-center text-primary dark"
                links.push(
                    <DropdownMenu key={group.title}>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={
                                    group.collections.some(isMatch)
                                        ? cn(className)
                                        : cn(className, "text-muted-foreground", "hover:text-foreground")
                                }
                            >
                                {group.title}
                                <ChevronsUpDown className="ml-2 h-4 w-4" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56 dark print:hidden">
                            <DropdownMenuGroup>
                                {group.collections.map((collection: string) => {
                                    const className = "block w-full cursor-pointer text-primary"
                                    return (
                                        <DropdownMenuItem
                                            key={collection}
                                            className={
                                                isMatch(collection)
                                                    ? className
                                                    : cn(className, "text-muted-foreground", "hover:text-foreground")
                                            }
                                            onClick={() => {
                                                runViewTransition(() => navigate(`/${collection.toLowerCase()}`))
                                            }}
                                        >
                                            {/* eslint-disable-next-line security/detect-object-injection */}
                                            <Suspense fallback={null}>
                                                <div className="flex items-center">
                                                    {/* eslint-disable security/detect-object-injection */}
                                                    {iconNames[collection]
                                                        ? createElement(iconNames[collection], { className: "mr-2" })
                                                        : null}
                                                    {collectionTitles[collection]}
                                                    {/* eslint-enable security/detect-object-injection */}
                                                </div>
                                            </Suspense>
                                        </DropdownMenuItem>
                                    )
                                })}
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>,
                )
            }
        }
        if (enableMfa && ((!mfaActive && !mfaEnabled) || mfaRevoked)) {
            links.push(
                <button
                    key="mfa-enroll"
                    className="bg-red-700 h-full p-4 hover:text-foreground text-white"
                    onClick={() => multiFactorEnroll(user, getMultiFactorCode)}
                >
                    Enable MFA
                </button>,
            )
        }
        return links
    }, [navbarMenu, location.pathname, enableMfa, mfaActive, mfaEnabled, mfaRevoked, navigate])

    const signOutUser = useCallback(async () => {
        if (isGlobalLoadingRef.current > 0 || isGlobalCachePendingRef.current > 0) {
            setDialogContent({
                title: "Some of your changes are still saving",
                description: "Are you sure you want to log out now?",
                buttons: [
                    {
                        label: "Log Out",
                        onClick: async () => {
                            signOut()
                            setDialogContent(null)
                        },
                    },
                ],
            })
            return
        }
        signOut()
        setDialogContent(null)
    }, [])

    onStokerSignOut(() => {
        sessionStorage.removeItem("stoker-state")
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith("stoker-draft-")) {
                localStorage.removeItem(key)
            }
        }
        setMode("login")
        runViewTransition(() => navigate("/"))
    })

    const revokeMfa = useCallback(async () => {
        const firebaseFunctions = getFunctions(app, import.meta.env.STOKER_FB_FUNCTIONS_REGION)
        const revokeMfaApi = httpsCallable(firebaseFunctions, "stoker-revokemfa")
        try {
            const revokeMfaResult = await revokeMfaApi()
            const revokeMfa = (revokeMfaResult.data as { success: boolean }).success
            if (revokeMfa) {
                alert("MFA successfully revoked")
                setMfaRevoked(true)
                setMfaEnabled(false)
            } else {
                alert("Failed to revoke MFA")
                setMfaRevoked(false)
            }
        } catch {
            alert("Failed to revoke MFA")
            setMfaRevoked(false)
        }
    }, [])

    const isLoading = isGlobalLoading.size > 0 || isRouteLoading.has(location.pathname)

    const showSearchAll = useMemo(() => {
        return (
            Object.values(schema.collections).filter((collection) => {
                const { fullTextSearch } = collection
                if (!permissions?.collections) return null
                // eslint-disable-next-line security/detect-object-injection
                const collectionPermissions = permissions.collections[collection.labels.collection]
                if (!collectionAccess("Read", collectionPermissions)) return null
                if (collection.singleton || collection.parentCollection || !fullTextSearch) return null
                return true
            }).length > 0
        )
    }, [permissions])

    return (
        appName &&
        collectionTitles && (
            <>
                <Helmet>
                    {meta?.description && <meta name="description" content={meta.description} />}
                    {meta?.icons ? (
                        meta.icons.map((icon) => (
                            <link key={icon.rel} rel={icon.rel} type={icon.type} href={icon.url} />
                        ))
                    ) : (
                        <link key="favicon" rel="icon" type="image/png" href="./favicon.ico" />
                    )}
                </Helmet>

                <Dialog
                    open={dialogContent !== null}
                    onOpenChange={() => {
                        if (!dialogContent?.disableClose) {
                            setDialogContent(null)
                        }
                    }}
                >
                    <DialogContent
                        onEscapeKeyDown={(e) => {
                            if (dialogContent?.disableClose) {
                                e.preventDefault()
                            }
                        }}
                        hideCloseButton={dialogContent?.disableClose}
                    >
                        <DialogHeader>
                            <DialogTitle>{dialogContent?.title}</DialogTitle>
                            <DialogDescription>{dialogContent?.description}</DialogDescription>
                        </DialogHeader>

                        {mfaDialog && (
                            <div className="flex flex-col gap-4 items-center">
                                <QRCodeSVG value={mfaDialog.totpUri} size={180} />
                                <div className="w-full flex flex-col items-center">
                                    <label htmlFor="mfa-code" className="mb-1">
                                        Enter 6-digit code
                                    </label>
                                    <Input
                                        id="mfa-code"
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]{6}"
                                        maxLength={6}
                                        value={mfaCode}
                                        onChange={(e) => {
                                            const value = e.target.value.replace(/[^0-9]/g, "")
                                            setMfaCode(value)
                                            mfaCodeRef.current = value
                                            setMfaError("")
                                        }}
                                        className="text-center w-32"
                                    />
                                    {mfaError && <div className="text-destructive text-xs mt-1">{mfaError}</div>}
                                </div>
                            </div>
                        )}

                        {(!dialogContent?.disableClose || dialogContent?.buttons) && (
                            <DialogFooter>
                                <div className="flex gap-2 justify-end">
                                    {dialogContent?.buttons?.map((button) => (
                                        <Button key={button.label} onClick={button.onClick}>
                                            {button.label}
                                        </Button>
                                    ))}
                                    {!dialogContent?.disableClose && (
                                        <Button onClick={() => setDialogContent(null)} variant="outline">
                                            Close
                                        </Button>
                                    )}
                                </div>
                            </DialogFooter>
                        )}
                    </DialogContent>
                </Dialog>

                <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-[rgb(39,39,42)] bg-black px-4 lg:px-6 print:hidden select-none">
                    <nav className="hidden h-full flex-col gap-6 text-lg font-medium lg:flex lg:flex-row lg:items-center lg:text-sm lg:gap-6 dark">
                        <button
                            className="flex h-full items-center gap-2"
                            key="home"
                            onClick={() => {
                                runViewTransition(() => navigate("/"))
                            }}
                        >
                            <img src={logo || defaultLogo} alt="Logo" className="h-8 mr-2" />
                        </button>
                        {links}
                    </nav>
                    <div className="hidden items-center text-sm font-medium gap-4 lg:ml-auto lg:flex lg:gap-4">
                        {isLoading && connectionStatus === "online" && <LoadingSpinner size={7} dark />}
                        {connectionStatus === "offline" && <Badge variant="destructive">Offline</Badge>}
                        {showSearchAll && (
                            <div className="ml-auto flex-1 lg:flex-initial text-primary dark">
                                <Popover open={searchFocused && Boolean(search)}>
                                    <PopoverTrigger asChild>
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                type="search"
                                                value={search}
                                                onChange={(e) => setSearch(e.target.value)}
                                                placeholder="Search all..."
                                                className="pl-8 lg:w-[195px] xl:w-[275px]"
                                                onFocus={() => {
                                                    setTimeout(() => {
                                                        setSearchFocused(true)
                                                    }, 100)
                                                }}
                                                onBlur={() => setSearchFocused(false)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Escape") {
                                                        setSearchFocused(false)
                                                    } else {
                                                        setSearchFocused(true)
                                                    }
                                                }}
                                            />
                                        </div>
                                    </PopoverTrigger>
                                    {search && showSearchAll && <SearchAll query={search} />}
                                </Popover>
                            </div>
                        )}
                        <ModeToggle />
                        {enableMfa && (mfaActive || mfaEnabled) && !mfaRevoked && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon">
                                        <User />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="w-56 dark print:hidden">
                                    <DropdownMenuGroup>
                                        <DropdownMenuItem
                                            onClick={() => {
                                                revokeMfa()
                                            }}
                                        >
                                            Revoke MFA
                                        </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        <button className="text-muted-foreground hover:text-foreground dark" onClick={signOutUser}>
                            Sign Out
                        </button>
                    </div>

                    <Sheet>
                        <SheetTrigger asChild>
                            <Button size="icon" variant="outline" className="absolute left-4 lg:hidden dark">
                                <PanelLeft className="h-5 w-5 text-primary" />
                                <span className="sr-only">Toggle Menu</span>
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="sm:max-w-xs overflow-y-auto">
                            <nav className="grid gap-6 text-lg font-medium pt-12">
                                <button
                                    className={
                                        window.location.pathname === "/"
                                            ? "flex items-center gap-4 px-2.5 text-foreground"
                                            : "flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground"
                                    }
                                    onClick={() => runViewTransition(() => navigate("/"))}
                                >
                                    <ChartBar className="h-5 w-5" />
                                    Dashboard
                                </button>
                                {sidebarMenu.map((group) => {
                                    if (group.collections.length === 1) {
                                        const className = "flex items-center gap-4 px-2.5 text-primary"
                                        return (
                                            <button
                                                key={group.collections[0]}
                                                className={
                                                    isMatch(group.collections[0])
                                                        ? cn(className, "text-foreground")
                                                        : cn(className, "text-muted-foreground hover:text-foreground")
                                                }
                                                onClick={() =>
                                                    runViewTransition(() =>
                                                        navigate(`/${group.collections[0].toLowerCase()}`),
                                                    )
                                                }
                                            >
                                                {/* eslint-disable security/detect-object-injection */}
                                                {iconNames[group.collections[0]]
                                                    ? createElement(iconNames[group.collections[0]], {
                                                          className: "h-5 w-5",
                                                      })
                                                    : null}
                                                {collectionTitles[group.collections[0]]}
                                                {/* eslint-enable security/detect-object-injection */}
                                            </button>
                                        )
                                    } else {
                                        return group.collections.map((collection) => {
                                            const className = "flex items-center gap-4 px-2.5 text-primary"
                                            return (
                                                <button
                                                    key={collection}
                                                    className={
                                                        isMatch(collection)
                                                            ? cn(className, "text-foreground")
                                                            : cn(
                                                                  className,
                                                                  "text-muted-foreground hover:text-foreground",
                                                              )
                                                    }
                                                    onClick={() =>
                                                        runViewTransition(() =>
                                                            navigate(`/${collection.toLowerCase()}`),
                                                        )
                                                    }
                                                >
                                                    {/* eslint-disable security/detect-object-injection */}
                                                    {iconNames[collection]
                                                        ? createElement(iconNames[collection], { className: "h-5 w-5" })
                                                        : null}
                                                    {collectionTitles[collection]}
                                                    {/* eslint-enable security/detect-object-injection */}
                                                </button>
                                            )
                                        })
                                    }
                                })}
                                {enableMfa && ((!mfaActive && !mfaEnabled) || mfaRevoked) && (
                                    <button
                                        key="mfa-enroll-mobile"
                                        className="flex items-center gap-4 px-2.5 bg-destructive p-4 rounded-md text-white"
                                        onClick={() => multiFactorEnroll(user, getMultiFactorCode)}
                                    >
                                        Enable MFA
                                    </button>
                                )}
                            </nav>
                            <div className="grid gap-6 text-lg mt-6 font-medium">
                                <button
                                    className="flex items-center gap-4 px-2.5 text-muted-foreground hover:text-foreground"
                                    onClick={signOutUser}
                                >
                                    Sign Out
                                </button>
                                <div>
                                    <ModeToggle />
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                    <div className="flex justify-center items-center w-full lg:hidden">
                        <img src={logo || defaultLogo} alt="Logo" className="h-8" />
                    </div>
                    <div className="absolute right-4 flex justify-center items-center gap-4 ml-auto lg:hidden">
                        {isLoading && connectionStatus === "online" && <LoadingSpinner size={7} dark />}
                        {connectionStatus === "offline" && <Badge variant="destructive">Offline</Badge>}
                    </div>
                </header>
                <main className="flex w-full flex-col">
                    <Outlet />
                </main>
                <Toaster />
            </>
        )
    )
}

export default Tenant

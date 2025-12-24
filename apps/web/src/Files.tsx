import { Helmet } from "react-helmet"
import {
    CollectionMeta,
    CollectionSchema,
    StokerCollection,
    StokerRecord,
    StorageItem,
    UploadProgress,
} from "@stoker-platform/types"
import { useEffect, useState, useCallback } from "react"
import { getCachedConfigValue, runHooks, sanitizeDownloadFilename, validateStorageName } from "@stoker-platform/utils"
import {
    getCollectionConfigModule,
    getFiles,
    deleteFolder,
    getCurrentUserPermissions,
    getGlobalConfigModule,
    getTenant,
} from "@stoker-platform/web-client"
import {
    getStorage,
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,
    getMetadata,
    updateMetadata,
} from "firebase/storage"
import { getAuth } from "firebase/auth"
import { Progress } from "./components/ui/progress"
import { Button } from "./components/ui/button"
import { Input } from "./components/ui/input"
import {
    Upload,
    Download,
    Edit,
    Trash2,
    Folder,
    File,
    ChevronRight,
    ArrowLeft,
    Plus,
    ChevronLeft,
    Lock,
} from "lucide-react"
import { useToast } from "./hooks/use-toast"
import { cn } from "./lib/utils"
import { LoadingSpinner } from "./components/ui/loading-spinner"
import { FirebaseError } from "firebase/app"
import { useRouteLoading } from "./providers/LoadingProvider"
import { useLocation } from "react-router"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./components/ui/alert-dialog"
import { FilePermissionsDialog, FilePermissions } from "./FilePermissions"

interface FilesProps {
    collection: CollectionSchema
    record: StokerRecord | undefined
}

export const RecordFiles = ({ collection, record }: FilesProps) => {
    const tenantId = getTenant()
    const { labels } = collection
    const customization = getCollectionConfigModule(labels.collection)
    const { toast } = useToast()
    const storage = getStorage()
    const location = useLocation()
    const permissions = getCurrentUserPermissions()
    const auth = getAuth()
    const currentUser = auth.currentUser
    const globalConfig = getGlobalConfigModule()

    const [collectionTitle, setCollectionTitle] = useState("")
    const [meta, setMeta] = useState<CollectionMeta | undefined>(undefined)
    const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([])
    const [isDragOver, setIsDragOver] = useState(false)
    const [currentPath, setCurrentPath] = useState("")
    const [items, setItems] = useState<StorageItem[]>([])
    const [loading, setLoading] = useState(false)
    const [editingFile, setEditingFile] = useState<string | null>(null)
    const [newFileName, setNewFileName] = useState("")
    const [creatingFolder, setCreatingFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState("")
    const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set())
    const [renamingFiles, setRenamingFiles] = useState<Set<string>>(new Set())
    const { setIsRouteLoading } = useRouteLoading()

    const [showFilenameDialog, setShowFilenameDialog] = useState(false)
    const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null)
    const [editingFilename, setEditingFilename] = useState("")

    const [showPermissionsDialog, setShowPermissionsDialog] = useState(false)
    const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([])
    const [isMultipleFileUpload, setIsMultipleFileUpload] = useState(false)
    const [showUpdatePermissionsDialog, setShowUpdatePermissionsDialog] = useState(false)
    const [selectedFileForPermissions, setSelectedFileForPermissions] = useState<StorageItem | null>(null)

    const [showFolderPermissionsDialog, setShowFolderPermissionsDialog] = useState(false)
    const [pendingFolderName, setPendingFolderName] = useState("")

    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [itemToDelete, setItemToDelete] = useState<StorageItem | null>(null)

    const [currentPage, setCurrentPageNumber] = useState(1)
    const [isSettingCurrentPage, setIsSettingCurrentPage] = useState<number | null>(null)
    const [itemsPerPage] = useState(20)

    const setCurrentPage = useCallback((page: number) => {
        setIsSettingCurrentPage(page)
        setTimeout(() => {
            setCurrentPageNumber(page)
            setIsSettingCurrentPage(null)
        }, 150)
    }, [])

    const basePath = record ? `${tenantId}/${record.Collection_Path.join("/")}/${record.id}` : ""

    const totalPages = Math.ceil(items.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const currentItems = items.slice(startIndex, endIndex)

    useEffect(() => {
        setCurrentPage(1)
    }, [items.length])

    useEffect(() => {
        const interval = setInterval(() => {
            setUploadProgress((prev) =>
                prev.filter((item) => {
                    if (item.status === "uploading") return true
                    if (item.status === "completed" && item.completedAt) {
                        const timeSinceCompletion = Date.now() - item.completedAt
                        return timeSinceCompletion < 2000
                    }
                    return false
                }),
            )
        }, 100)

        return () => clearInterval(interval)
    }, [])

    useEffect(() => {
        const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
            "collections",
            labels.collection,
            "admin",
        ]
        const initialize = async () => {
            const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
            setCollectionTitle(titles?.collection || labels.collection)
            const meta = await getCachedConfigValue(customization, [...collectionAdminPath, "meta"])
            setMeta(meta)
        }
        initialize()
    }, [])

    const getUserRoleAssignment = useCallback(() => {
        const userRole = permissions?.Role
        if (!userRole) return null
        // eslint-disable-next-line security/detect-object-injection
        const assignment = collection.access?.files?.assignment?.[userRole]
        return assignment || null
    }, [collection, permissions])

    const shouldSkipPermissionsDialog = useCallback(() => {
        const assignment = getUserRoleAssignment()
        if (!assignment) return false
        const optional = assignment.optional || {}
        const hasOptional = Boolean(
            (optional.read && optional.read.length) ||
            (optional.update && optional.update.length) ||
            (optional.delete && optional.delete.length),
        )
        return !hasOptional
    }, [getUserRoleAssignment])

    const getDefaultPermissions = useCallback((): FilePermissions => {
        const assignment = getUserRoleAssignment()
        const required = assignment?.required || {}
        return {
            read: (required.read || []).join(","),
            update: (required.update || []).join(","),
            delete: (required.delete || []).join(","),
        }
    }, [getUserRoleAssignment])

    const loadDirectory = useCallback(
        async (path: string) => {
            if (!record) return
            setLoading(true)
            try {
                const items = await getFiles(path, record)

                setItems(items)
                setCurrentPath(path)
            } catch (error) {
                console.error((error as FirebaseError).message)
                toast({
                    title: "Error",
                    description: "Failed to load files",
                    variant: "destructive",
                })
            } finally {
                setLoading(false)
            }
        },
        [record],
    )

    useEffect(() => {
        if (record) {
            loadDirectory("")
        }
    }, [record])

    const uploadFiles = useCallback(
        async (files: FileList | File[], permissions?: FilePermissions, customFilename?: string) => {
            if (!files || !record || !currentUser) return

            const fileArray = Array.from(files)

            for (const file of fileArray) {
                const filename = (customFilename || file.name).trim()
                const validationError = validateStorageName(filename)
                if (validationError) {
                    toast({
                        title: "Invalid file name",
                        description: validationError,
                        variant: "destructive",
                    })
                    continue
                }
                const filePath = currentPath ? `${basePath}/${currentPath}/${filename}` : `${basePath}/${filename}`
                const storageRef = ref(storage, filePath)
                const uploadItem: UploadProgress = {
                    file,
                    progress: 0,
                    status: "uploading",
                }

                setUploadProgress((prev) => [...prev, uploadItem])

                const metadata = {
                    customMetadata: {
                        read: permissions?.read || "",
                        update: permissions?.update || "",
                        delete: permissions?.delete || "",
                        createdBy: currentUser.uid,
                    },
                }

                try {
                    await runHooks("preFileAdd", globalConfig, customization, [
                        record,
                        filePath,
                        filename,
                        {
                            read: metadata.customMetadata.read,
                            update: metadata.customMetadata.update,
                            delete: metadata.customMetadata.delete,
                        },
                    ])
                } catch {
                    setUploadProgress((prev) =>
                        prev.map((item) => (item.file === file ? { ...item, status: "error" } : item)),
                    )
                    continue
                }

                const uploadTask = uploadBytesResumable(storageRef, file, metadata)

                uploadTask.on(
                    "state_changed",
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                        setUploadProgress((prev) =>
                            prev.map((item) => (item.file === file ? { ...item, progress } : item)),
                        )
                    },
                    (error) => {
                        setUploadProgress((prev) =>
                            prev.map((item) =>
                                item.file === file ? { ...item, status: "error", error: error.message } : item,
                            ),
                        )
                        console.error(error.message)
                        toast({
                            title: "Upload failed",
                            description: `Failed to upload ${filename}`,
                            variant: "destructive",
                        })
                    },
                    async () => {
                        setUploadProgress((prev) =>
                            prev.map((item) =>
                                item.file === file ? { ...item, status: "completed", completedAt: Date.now() } : item,
                            ),
                        )
                        toast({
                            title: "Upload successful",
                            description: `${filename} uploaded successfully`,
                        })

                        try {
                            await runHooks("postFileAdd", globalConfig, customization, [
                                record,
                                filePath,
                                filename,
                                {
                                    read: metadata.customMetadata.read,
                                    update: metadata.customMetadata.update,
                                    delete: metadata.customMetadata.delete,
                                },
                            ])
                        } catch {
                            return
                        }

                        loadDirectory(currentPath)
                    },
                )
            }

            setShowFilenameDialog(false)
            setShowPermissionsDialog(false)
            setPendingUploadFile(null)
            setEditingFilename("")
            setPendingUploadFiles([])
            setIsMultipleFileUpload(false)
        },
        [record, currentPath, basePath, currentUser],
    )

    const handleFileUpload = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const files = event.target.files
            if (!files) return

            if (files.length === 1) {
                const file = files[0]
                setPendingUploadFile(file)
                setEditingFilename(file.name)
                setIsMultipleFileUpload(false)
                setShowFilenameDialog(true)
            } else {
                const fileList = Array.from(files)
                if (shouldSkipPermissionsDialog()) {
                    await uploadFiles(fileList, getDefaultPermissions())
                } else {
                    setPendingUploadFiles(fileList)
                    setIsMultipleFileUpload(true)
                    setShowPermissionsDialog(true)
                }
            }
            event.target.value = ""
        },
        [uploadFiles, shouldSkipPermissionsDialog, getDefaultPermissions],
    )

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(true)
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)
    }, [])

    const handleDrop = useCallback(
        async (e: React.DragEvent) => {
            e.preventDefault()
            setIsDragOver(false)

            const files = e.dataTransfer.files
            if (files.length > 0) {
                if (files.length === 1) {
                    const file = files[0]
                    setPendingUploadFile(file)
                    setEditingFilename(file.name)
                    setIsMultipleFileUpload(false)
                    setShowFilenameDialog(true)
                } else {
                    const fileList = Array.from(files)
                    if (shouldSkipPermissionsDialog()) {
                        await uploadFiles(fileList, getDefaultPermissions())
                    } else {
                        setPendingUploadFiles(fileList)
                        setIsMultipleFileUpload(true)
                        setShowPermissionsDialog(true)
                    }
                }
            }
        },
        [uploadFiles, shouldSkipPermissionsDialog, getDefaultPermissions],
    )

    const handleConfirmFilename = useCallback(async () => {
        if (!pendingUploadFile) return
        const trimmedName = editingFilename.trim()
        const validationError = validateStorageName(trimmedName)
        if (validationError) {
            toast({ title: "Invalid file name", description: validationError, variant: "destructive" })
            return
        }
        if (shouldSkipPermissionsDialog()) {
            await uploadFiles([pendingUploadFile], getDefaultPermissions(), trimmedName)
        } else {
            setShowPermissionsDialog(true)
        }
    }, [pendingUploadFile, editingFilename, shouldSkipPermissionsDialog, uploadFiles, getDefaultPermissions])

    const handleCancelFilename = useCallback(() => {
        setShowFilenameDialog(false)
        setPendingUploadFile(null)
        setEditingFilename("")
    }, [])

    const handlePermissionsConfirm = useCallback(
        async (permissions: FilePermissions) => {
            if (isMultipleFileUpload) {
                if (pendingUploadFiles.length > 0) {
                    await uploadFiles(pendingUploadFiles, permissions)
                }
            } else {
                if (!pendingUploadFile) return
                await uploadFiles([pendingUploadFile], permissions, editingFilename.trim())
            }
        },
        [isMultipleFileUpload, pendingUploadFiles, pendingUploadFile, editingFilename, uploadFiles],
    )

    const handlePermissionsCancel = useCallback(() => {
        setShowPermissionsDialog(false)
        setPendingUploadFiles([])
        setIsMultipleFileUpload(false)
    }, [])

    const handleFilePermissionsClick = useCallback((item: StorageItem) => {
        setSelectedFileForPermissions(item)
        setShowUpdatePermissionsDialog(true)
    }, [])

    const handleUpdatePermissionsConfirm = useCallback(
        async (permissions: FilePermissions) => {
            if (!selectedFileForPermissions || !record || !currentUser) return

            try {
                setIsRouteLoading("+", location.pathname, true)

                const targetRef = selectedFileForPermissions.isFolder
                    ? ref(storage, `${selectedFileForPermissions.fullPath}/.placeholder`)
                    : ref(storage, selectedFileForPermissions.fullPath)
                const metadata = await getMetadata(targetRef)

                const updatedMetadata = {
                    ...metadata,
                    customMetadata: {
                        ...metadata.customMetadata,
                        read: permissions.read,
                        update: permissions.update,
                        delete: permissions.delete,
                        createdBy: metadata.customMetadata?.createdBy || "",
                    },
                }

                try {
                    await runHooks("preFileUpdate", globalConfig, customization, [
                        record,
                        {
                            type: "permissions",
                            path: selectedFileForPermissions.fullPath,
                            originalPermissions: {
                                read: metadata.customMetadata?.read,
                                update: metadata.customMetadata?.update,
                                delete: metadata.customMetadata?.delete,
                            },
                            permissions: {
                                read: updatedMetadata.customMetadata.read,
                                update: updatedMetadata.customMetadata.update,
                                delete: updatedMetadata.customMetadata.delete,
                            },
                        },
                    ])
                } catch {
                    return
                }

                await updateMetadata(targetRef, updatedMetadata)

                toast({
                    title: "Permissions updated",
                    description: `Permissions for ${selectedFileForPermissions.name} have been updated`,
                })

                try {
                    await runHooks("postFileUpdate", globalConfig, customization, [
                        record,
                        {
                            type: "permissions",
                            path: selectedFileForPermissions.fullPath,
                            originalPermissions: {
                                read: metadata.customMetadata?.read,
                                update: metadata.customMetadata?.update,
                                delete: metadata.customMetadata?.delete,
                            },
                            permissions: {
                                read: updatedMetadata.customMetadata.read,
                                update: updatedMetadata.customMetadata.update,
                                delete: updatedMetadata.customMetadata.delete,
                            },
                        },
                    ])
                } catch {
                    return
                }

                loadDirectory(currentPath)
            } catch (error) {
                console.error((error as FirebaseError).message)
                toast({
                    title: "Error",
                    description: `Failed to update permissions for ${selectedFileForPermissions.name}`,
                    variant: "destructive",
                })
            } finally {
                setIsRouteLoading("-", location.pathname)
                setShowUpdatePermissionsDialog(false)
                setSelectedFileForPermissions(null)
            }
        },
        [selectedFileForPermissions, record, location.pathname, currentPath, currentUser],
    )

    const handleUpdatePermissionsCancel = useCallback(() => {
        setShowUpdatePermissionsDialog(false)
        setSelectedFileForPermissions(null)
    }, [])

    const handleDownload = useCallback(
        async (item: StorageItem) => {
            let objectURL: string | null = null
            let timeoutId: NodeJS.Timeout | null = null

            try {
                const expectedPath = `${tenantId}/${labels.collection}/${record?.id}`
                if (!item.fullPath.startsWith(expectedPath)) {
                    throw new Error("Access denied: Invalid file path")
                }

                const fileRef = ref(storage, item.fullPath)
                const downloadURL = await getDownloadURL(fileRef)

                const response = await fetch(downloadURL)
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`)
                }

                const blob = await response.blob()

                objectURL = URL.createObjectURL(blob)

                const link = document.createElement("a")
                link.href = objectURL
                link.rel = "noopener noreferrer"
                link.referrerPolicy = "no-referrer"
                link.style.display = "none"
                link.download = sanitizeDownloadFilename(item.name)

                document.body.appendChild(link)
                link.click()
                document.body.removeChild(link)

                timeoutId = setTimeout(() => {
                    if (objectURL) {
                        URL.revokeObjectURL(objectURL)
                    }
                }, 100)
            } catch (error) {
                if (objectURL) {
                    URL.revokeObjectURL(objectURL)
                }
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
                console.error((error as FirebaseError).message)
                toast({
                    title: "Error",
                    description: `Failed to download ${item.name}`,
                    variant: "destructive",
                })
            }
        },
        [storage, toast],
    )

    const handleDeleteClick = useCallback((item: StorageItem) => {
        setItemToDelete(item)
        setShowDeleteDialog(true)
    }, [])

    const handleDeleteConfirm = useCallback(async () => {
        if (!itemToDelete || !record) return

        try {
            setIsRouteLoading("+", location.pathname, true)
            setDeletingFiles((prev) => new Set(prev).add(itemToDelete.name))

            if (itemToDelete.isFolder) {
                await deleteFolder(currentPath, record, itemToDelete.name)
                toast({
                    title: "Folder deleted",
                    description: `${itemToDelete.name} has been deleted`,
                })
            } else {
                const fileRef = ref(storage, itemToDelete.fullPath)
                await deleteObject(fileRef)
                toast({
                    title: "File deleted",
                    description: `${itemToDelete.name} has been deleted`,
                })
            }

            loadDirectory(currentPath)
        } catch (error) {
            console.error((error as FirebaseError).message)
            toast({
                title: "Error",
                description: `Failed to delete ${itemToDelete.name}`,
                variant: "destructive",
            })
        } finally {
            setDeletingFiles((prev) => {
                const newSet = new Set(prev)
                newSet.delete(itemToDelete.name)
                return newSet
            })
            setIsRouteLoading("-", location.pathname)
            setShowDeleteDialog(false)
            setItemToDelete(null)
        }
    }, [itemToDelete, currentPath, location.pathname, record])

    const handleDeleteCancel = useCallback(() => {
        setShowDeleteDialog(false)
        setItemToDelete(null)
    }, [])

    const handleEditName = useCallback(
        async (item: StorageItem, newName: string) => {
            if (!record) return
            if (newName === item.name) {
                setEditingFile(null)
                return
            }

            const validationError = validateStorageName(newName.trim())
            if (validationError) {
                toast({ title: "Invalid file name", description: validationError, variant: "destructive" })
                return
            }

            try {
                setIsRouteLoading("+", location.pathname, true)
                setRenamingFiles((prev) => new Set(prev).add(item.name))
                const pathParts = item.fullPath.split("/")
                pathParts.pop()
                const newPath = [...pathParts, newName].join("/")

                const originalRef = ref(storage, item.fullPath)
                const downloadURL = await getDownloadURL(originalRef)
                const metadata = await getMetadata(originalRef)

                try {
                    await runHooks("preFileUpdate", globalConfig, customization, [
                        record,
                        { type: "rename", oldPath: item.fullPath, newPath },
                    ])
                } catch {
                    return
                }

                const response = await fetch(downloadURL)
                const blob = await response.blob()

                const newRef = ref(storage, newPath)
                await uploadBytesResumable(newRef, blob, { customMetadata: metadata.customMetadata })

                await deleteObject(originalRef)

                toast({
                    title: "File renamed",
                    description: `${item.name} has been renamed to ${newName}`,
                })

                try {
                    await runHooks("postFileUpdate", globalConfig, customization, [
                        record,
                        { type: "rename", oldPath: item.fullPath, newPath },
                    ])
                } catch {
                    return
                }

                setEditingFile(null)

                loadDirectory(currentPath)
            } catch (error) {
                console.error((error as FirebaseError).message)
                toast({
                    title: "Error",
                    description: `Failed to rename ${item.name}`,
                    variant: "destructive",
                })
            } finally {
                setRenamingFiles((prev) => {
                    const newSet = new Set(prev)
                    newSet.delete(item.name)
                    return newSet
                })
                setIsRouteLoading("-", location.pathname)
            }
        },
        [currentPath],
    )

    const navigateToFolder = useCallback(
        (folderName: string) => {
            const newPath = currentPath ? `${currentPath}/${folderName}` : folderName
            loadDirectory(newPath)
        },
        [currentPath],
    )

    const navigateUp = useCallback(() => {
        if (!currentPath) return

        const pathParts = currentPath.split("/")
        pathParts.pop()
        const newPath = pathParts.join("/")
        loadDirectory(newPath)
    }, [currentPath])

    const getPathBreadcrumbs = useCallback(() => {
        if (!currentPath) return []
        return currentPath.split("/")
    }, [currentPath])

    const createFolder = useCallback(
        async (folderName: string, permissions?: FilePermissions) => {
            const validationError = validateStorageName(folderName.trim())
            if (validationError) {
                toast({ title: "Invalid folder name", description: validationError, variant: "destructive" })
                return
            }
            if (!currentUser || !record) {
                return
            }

            try {
                const folderPath = currentPath
                    ? `${basePath}/${currentPath}/${folderName}`
                    : `${basePath}/${folderName}`
                const placeholderRef = ref(storage, `${folderPath}/.placeholder`)
                const placeholderBlob = new Blob([""], { type: "text/plain" })

                const metadata = {
                    customMetadata: {
                        read: permissions?.read || "",
                        update: permissions?.update || "",
                        delete: permissions?.delete || "",
                        createdBy: currentUser.uid,
                    },
                }

                await uploadBytesResumable(placeholderRef, placeholderBlob, metadata)

                toast({
                    title: "Folder created",
                    description: `Folder "${folderName}" has been created`,
                })

                setCreatingFolder(false)
                setNewFolderName("")
                setPendingFolderName("")

                loadDirectory(currentPath)
            } catch (error) {
                console.error((error as FirebaseError).message)
                toast({
                    title: "Error",
                    description: `Failed to create folder "${folderName}"`,
                    variant: "destructive",
                })
            }
        },
        [currentPath, basePath, currentUser, record],
    )

    const handleCreateFolderClick = useCallback(() => {
        const validationError = validateStorageName(newFolderName.trim())
        if (validationError) {
            toast({ title: "Invalid folder name", description: validationError, variant: "destructive" })
            return
        }
        setPendingFolderName(newFolderName.trim())
        setShowFolderPermissionsDialog(true)
    }, [newFolderName])

    const handleFolderPermissionsConfirm = useCallback(
        async (permissions: FilePermissions) => {
            if (!pendingFolderName) return
            await createFolder(pendingFolderName, permissions)
            setShowFolderPermissionsDialog(false)
        },
        [pendingFolderName, createFolder],
    )

    const handleFolderPermissionsCancel = useCallback(() => {
        setShowFolderPermissionsDialog(false)
    }, [])

    let borderClass = "border-primary/40"
    let textClass = "text-primary/50"
    if (isDragOver) {
        borderClass = "border-green-500"
        textClass = "text-green-500"
    }

    return (
        <>
            <Helmet>
                <title>{`${meta?.title || collectionTitle || labels.collection} - Files`}</title>
                {meta?.description && <meta name="description" content={meta.description} />}
            </Helmet>

            <div className="flex items-center space-x-2 mb-4">
                {currentPath && (
                    <Button variant="outline" size="sm" onClick={navigateUp} className="flex items-center space-x-1">
                        <ArrowLeft className="h-4 w-4" />
                        <span>Back</span>
                    </Button>
                )}

                <div className="flex flex-col space-y-1 sm:space-y-0 sm:flex-row sm:items-center sm:space-x-1 text-sm text-muted-foreground px-1">
                    {getPathBreadcrumbs().map((part, index) => (
                        <div key={index} className="flex items-center space-x-1">
                            {index > 0 && (
                                <div>
                                    <ChevronRight className="h-3 w-3" />
                                </div>
                            )}
                            <span>{part}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div
                className={cn(
                    "hidden lg:block border-4 border-dashed rounded-lg p-6 mt-4 transition-colors",
                    borderClass,
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className={cn("text-center font-bold", textClass)}>Drop files here</div>
            </div>
            <div className="flex items-center space-x-2 mt-4">
                <input
                    type="file"
                    multiple
                    className="block flex-1 text-[0px]
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-sm file:font-semibold
                        file:bg-primary/10 file:text-primary
                        file:cursor-pointer
                        hover:file:bg-primary/20
                        cursor-pointer"
                    onChange={handleFileUpload}
                />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCreatingFolder(true)}
                    className="flex items-center space-x-1 whitespace-nowrap"
                >
                    <Plus className="h-4 w-4" />
                    <span>New Folder</span>
                </Button>
            </div>

            {uploadProgress.length > 0 && (
                <div className="mt-6 space-y-4">
                    {uploadProgress
                        .filter((item) => {
                            if (item.status === "uploading") return true
                            if (item.status === "completed" && item.completedAt) {
                                const timeSinceCompletion = Date.now() - item.completedAt
                                return timeSinceCompletion < 2000
                            }
                            return false
                        })
                        .map((item, index) => (
                            <div key={index} className="border rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        <Upload
                                            className={cn(
                                                "h-4 w-4",
                                                item.status === "uploading" ? "animate-pulse" : "",
                                            )}
                                        />
                                        <span className="font-medium truncate">{item.file.name}</span>
                                    </div>
                                    <div className="text-sm text-right">
                                        {item.status === "uploading" ? `${Math.round(item.progress)}%` : "100%"}
                                    </div>
                                </div>

                                <Progress
                                    value={item.status === "uploading" ? item.progress : 100}
                                    className="w-full"
                                />
                            </div>
                        ))}
                </div>
            )}

            <div className="border rounded-lg mt-6">
                {loading ? (
                    <div className="p-4 text-center text-muted-foreground flex justify-center">
                        <LoadingSpinner size={7} />
                    </div>
                ) : (
                    <div className="divide-y">
                        {creatingFolder && (
                            <div className="flex items-center space-x-3 p-4 bg-muted/30">
                                <Folder className="h-5 w-5 text-blue-500" />
                                <div className="flex items-center space-x-2 flex-1">
                                    <Input
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        placeholder="Enter folder name"
                                        className="flex-1"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                handleCreateFolderClick()
                                            } else if (e.key === "Escape") {
                                                setCreatingFolder(false)
                                                setNewFolderName("")
                                            }
                                        }}
                                    />
                                    <Button size="sm" onClick={handleCreateFolderClick}>
                                        Create
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setCreatingFolder(false)
                                            setNewFolderName("")
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {currentItems.length === 0 && !creatingFolder ? (
                            <div className="p-4 text-center text-muted-foreground">No files found</div>
                        ) : (
                            <>
                                {currentItems.map((item, index) => {
                                    const isDeleting = deletingFiles.has(item.name)
                                    const isRenaming = renamingFiles.has(item.name)
                                    const isDisabled = isDeleting || isRenaming

                                    return (
                                        <div
                                            key={index}
                                            className={cn(
                                                "flex flex-col space-y-3 md:space-y-0 md:flex-row items-center justify-between p-4",
                                                isDisabled ? "opacity-50 pointer-events-none" : "hover:bg-muted/50",
                                            )}
                                        >
                                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                                                {item.isFolder ? (
                                                    <Folder className="h-5 w-5 text-blue-500" />
                                                ) : (
                                                    <File className="h-5 w-5 text-gray-500" />
                                                )}

                                                {editingFile === item.name && !isDisabled ? (
                                                    <div className="flex items-center space-x-2 flex-1">
                                                        <Input
                                                            value={newFileName}
                                                            onChange={(e) => setNewFileName(e.target.value)}
                                                            className="flex-1"
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") {
                                                                    handleEditName(item, newFileName)
                                                                } else if (e.key === "Escape") {
                                                                    setEditingFile(null)
                                                                }
                                                            }}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleEditName(item, newFileName)}
                                                        >
                                                            Save
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => setEditingFile(null)}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 min-w-0">
                                                        {item.isFolder ? (
                                                            <button
                                                                onClick={() => navigateToFolder(item.name)}
                                                                className="text-left hover:underline block w-full"
                                                            >
                                                                {item.name}
                                                            </button>
                                                        ) : (
                                                            <span className="block w-full">{item.name}</span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {!(editingFile === item.name && !isDisabled) && (
                                                <div className="flex items-center space-x-2">
                                                    {!item.isFolder && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleDownload(item)}
                                                            >
                                                                <Download className="h-4 w-4" />
                                                            </Button>
                                                            {(permissions?.Role &&
                                                                item.metadata?.update?.includes(permissions.Role)) ||
                                                            (currentUser &&
                                                                item.metadata?.createdBy === currentUser.uid) ? (
                                                                <>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => {
                                                                            setEditingFile(item.name)
                                                                            setNewFileName(item.name)
                                                                        }}
                                                                        disabled={isDisabled}
                                                                    >
                                                                        <Edit className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleFilePermissionsClick(item)}
                                                                        disabled={isDisabled}
                                                                    >
                                                                        <Lock className="h-4 w-4" />
                                                                    </Button>
                                                                </>
                                                            ) : null}
                                                        </>
                                                    )}
                                                    {item.isFolder &&
                                                        ((permissions?.Role &&
                                                            item.metadata?.update?.includes(permissions.Role)) ||
                                                            (currentUser &&
                                                                item.metadata?.createdBy === currentUser.uid)) && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleFilePermissionsClick(item)}
                                                                disabled={isDisabled}
                                                            >
                                                                <Lock className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    {((permissions?.Role &&
                                                        item.metadata?.delete?.includes(permissions.Role)) ||
                                                        (currentUser &&
                                                            item.metadata?.createdBy === currentUser.uid)) && (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleDeleteClick(item)}
                                                            disabled={isDisabled}
                                                            className="text-destructive hover:text-destructive"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </div>
                )}

                {items.length > itemsPerPage && (
                    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                        <div className="hidden md:block text-sm text-muted-foreground">
                            Showing {startIndex + 1} to {Math.min(endIndex, items.length)} of {items.length} items
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (isSettingCurrentPage) return
                                    setCurrentPage(1)
                                }}
                                disabled={currentPage === 1}
                            >
                                Back to start
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (isSettingCurrentPage) return
                                    setCurrentPage(Math.max(1, currentPage - 1))
                                }}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                Previous
                            </Button>

                            <div className="hidden md:flex items-center space-x-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNumber
                                    if (totalPages <= 5) {
                                        pageNumber = i + 1
                                    } else if (currentPage <= 3) {
                                        pageNumber = i + 1
                                    } else if (currentPage >= totalPages - 2) {
                                        pageNumber = totalPages - 4 + i
                                    } else {
                                        pageNumber = currentPage - 2 + i
                                    }

                                    return (
                                        <Button
                                            key={pageNumber}
                                            variant={
                                                currentPage === pageNumber && !isSettingCurrentPage
                                                    ? "default"
                                                    : "outline"
                                            }
                                            size="sm"
                                            onClick={() => setCurrentPage(pageNumber)}
                                            className="w-8 h-8 p-0"
                                        >
                                            {pageNumber}
                                        </Button>
                                    )
                                })}
                            </div>

                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (isSettingCurrentPage) return
                                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                                }}
                                disabled={currentPage === totalPages}
                            >
                                Next
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <Dialog open={showFilenameDialog} onOpenChange={setShowFilenameDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Filename</DialogTitle>
                        <DialogDescription className="hidden">
                            You can edit the filename before uploading.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div>
                            <Input
                                id="filename-input"
                                value={editingFilename}
                                onChange={(e) => setEditingFilename(e.target.value)}
                                placeholder="Enter new filename"
                                className="mt-1"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        handleConfirmFilename()
                                    } else if (e.key === "Escape") {
                                        handleCancelFilename()
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleCancelFilename}>
                            Cancel
                        </Button>
                        <Button onClick={handleConfirmFilename} disabled={!editingFilename.trim()}>
                            Upload
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <FilePermissionsDialog
                open={showPermissionsDialog}
                onOpenChange={setShowPermissionsDialog}
                collection={collection}
                filename={isMultipleFileUpload ? `${pendingUploadFiles.length} files` : editingFilename}
                onConfirm={handlePermissionsConfirm}
                onCancel={handlePermissionsCancel}
                isMultipleFileUpload={isMultipleFileUpload}
            />

            <FilePermissionsDialog
                open={showFolderPermissionsDialog}
                onOpenChange={setShowFolderPermissionsDialog}
                collection={collection}
                filename={pendingFolderName || ""}
                onConfirm={handleFolderPermissionsConfirm}
                onCancel={handleFolderPermissionsCancel}
                isMultipleFileUpload={false}
            />

            <FilePermissionsDialog
                key={selectedFileForPermissions?.name}
                open={showUpdatePermissionsDialog}
                onOpenChange={setShowUpdatePermissionsDialog}
                collection={collection}
                filename={selectedFileForPermissions?.name || ""}
                onConfirm={handleUpdatePermissionsConfirm}
                onCancel={handleUpdatePermissionsCancel}
                isMultipleFileUpload={false}
                initialPermissions={{
                    read: selectedFileForPermissions?.metadata?.read?.join(",") || "",
                    update: selectedFileForPermissions?.metadata?.update?.join(",") || "",
                    delete: selectedFileForPermissions?.metadata?.delete?.join(",") || "",
                }}
            />

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {itemToDelete?.isFolder ? "Folder" : "File"}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {itemToDelete?.isFolder ? (
                                <>
                                    Are you sure you want to delete the folder <strong>{itemToDelete?.name}</strong> and
                                    all of its contents? This action cannot be undone.
                                </>
                            ) : (
                                <>
                                    Are you sure you want to delete <strong>{itemToDelete?.name}</strong>? This action
                                    cannot be undone.
                                </>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleDeleteCancel}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

import { Button } from "@/components/ui/button"
import { RecordForm } from "@/Form"
import { CollectionSchema, StokerCollection, StokerRecord } from "@stoker-platform/types"
import { getCachedConfigValue, getCollectionConfigModule } from "@stoker-platform/web-client"
import { X } from "lucide-react"
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useMode } from "./ModeProvider"

export const CreateContext = createContext<
    | [
          showCreateModal: (
              collection: CollectionSchema,
              collectionPath: string[],
              record?: StokerRecord,
          ) => false | React.ReactPortal,
      ]
    | undefined
>(undefined)

interface CreateProviderProps {
    children: React.ReactNode
}

let openCreateModalHandler:
    | ((collection: CollectionSchema, collectionPath: string[], record?: StokerRecord) => false | React.ReactPortal)
    | null = null

export const callOpenCreateModal = (collection: CollectionSchema, collectionPath: string[], record?: StokerRecord) => {
    if (openCreateModalHandler) return openCreateModalHandler(collection, collectionPath, record)
    return false
}

// eslint-disable-next-line react/prop-types
export const CreateProvider: React.FC<CreateProviderProps> = ({ children }) => {
    const [mode] = useMode()
    const [open, setOpen] = useState(false)
    const [currentCollection, setCurrentCollection] = useState<CollectionSchema | null>(null)
    const [currentPath, setCurrentPath] = useState<string[] | null>(null)
    const [currentRecord, setCurrentRecord] = useState<StokerRecord | undefined>(undefined)
    const [pending, setPending] = useState<{
        collection: CollectionSchema
        collectionPath: string[]
        record?: StokerRecord
    } | null>(null)

    const labels = useMemo(() => currentCollection?.labels, [currentCollection])
    const customization = useMemo(
        () => (labels ? getCollectionConfigModule(labels.collection) : null),
        [labels?.collection],
    )
    const [recordTitle, setRecordTitle] = useState<string>(labels?.record || "")

    useEffect(() => {
        const initialize = async () => {
            if (!labels || !customization) return
            const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                "collections",
                labels.collection,
                "admin",
            ]
            const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
            setRecordTitle(titles?.record || labels.record)
        }
        initialize()
    }, [labels?.collection])

    const showCreateModal = (
        collection: CollectionSchema,
        collectionPath: string[],
        record?: StokerRecord,
    ): false | React.ReactPortal => {
        if (mode !== "app") {
            setPending({ collection, collectionPath, record })
            return false
        }
        setCurrentCollection(collection)
        setCurrentPath(collectionPath && collectionPath.length > 0 ? collectionPath : [collection.labels.collection])
        setCurrentRecord(record)
        setOpen(true)
        return false
    }

    const handlerRef = useRef(openCreateModalHandler)
    useEffect(() => {
        handlerRef.current = showCreateModal
        openCreateModalHandler = showCreateModal
        return () => {
            if (handlerRef.current === showCreateModal) openCreateModalHandler = null
        }
    }, [])

    useEffect(() => {
        if (mode === "app" && pending) {
            const { collection, collectionPath, record } = pending
            setPending(null)
            showCreateModal(collection, collectionPath, record)
        }
    }, [mode, pending])

    return (
        <CreateContext.Provider value={[showCreateModal]}>
            {children}
            {open &&
                currentCollection &&
                currentPath &&
                createPortal(
                    <div
                        id="create-record-modal"
                        className="fixed inset-0 z-50 flex items-center justify-center animate-in fade-in slide-in-from-top-4 duration-300"
                        aria-modal="true"
                        aria-live="polite"
                        role="dialog"
                    >
                        <div className="fixed inset-0 bg-black/50" />
                        <div
                            className="relative bg-background sm:rounded-lg p-6 w-full max-w-2xl h-full sm:h-[90vh] overflow-y-auto border border-border"
                            aria-labelledby="modal-title"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 id="modal-title" className="text-lg font-semibold">
                                    Create {recordTitle}
                                </h2>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setOpen(false)
                                    }}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            <RecordForm
                                collection={currentCollection}
                                operation="create"
                                path={currentPath}
                                record={currentRecord}
                                onSuccess={() => {
                                    setOpen(false)
                                }}
                            />
                        </div>
                    </div>,
                    document.body,
                )}
        </CreateContext.Provider>
    )
}

export const useCreate = () => {
    const context = useContext(CreateContext)
    if (!context) {
        throw new Error("useCreate must be used within a CreateProvider")
    }
    return context
}

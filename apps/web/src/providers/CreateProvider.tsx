import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RecordForm } from "@/Form"
import { CollectionSchema, StokerCollection, StokerRecord } from "@stoker-platform/types"
import { getCachedConfigValue, getCollectionConfigModule } from "@stoker-platform/web-client"
import { X } from "lucide-react"
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useMode } from "./ModeProvider"
import { removeDraft } from "@/utils/draftStorage"

export const MAX_MODAL_DEPTH = 2

export const ModalDepthContext = createContext(0)

export interface CreateModalOptions {
    parentDepth?: number
    onSuccess?: (record?: StokerRecord) => void
    trigger?: HTMLElement | null
}

type ShowCreateModal = (
    collection: CollectionSchema,
    collectionPath: string[],
    record?: StokerRecord,
    options?: CreateModalOptions,
) => false | React.ReactPortal

export const CreateContext = createContext<[showCreateModal: ShowCreateModal] | undefined>(undefined)

interface CreateProviderProps {
    children: React.ReactNode
}

let openCreateModalHandler: ShowCreateModal | null = null

export const callOpenCreateModal = (
    collection: CollectionSchema,
    collectionPath: string[],
    record?: StokerRecord,
    options?: CreateModalOptions,
) => {
    if (openCreateModalHandler) return openCreateModalHandler(collection, collectionPath, record, options)
    return false
}

export const createRecordClassName =
    "max-w-2xl w-full h-full sm:h-[90vh] overflow-hidden p-0 gap-0 flex flex-col translate-x-[-50%] translate-y-[-50%]"

const getTriggerElement = (trigger?: HTMLElement | null) => {
    if (trigger) return trigger
    const activeElement = document.activeElement
    return activeElement instanceof HTMLElement ? activeElement : undefined
}

interface CreateModalEntry {
    id: string
    collection: CollectionSchema
    collectionPath: string[]
    record?: StokerRecord
    depth: number
    onSuccess?: (record?: StokerRecord) => void
    trigger?: HTMLElement
    draftKey: string
}

interface CreateModalProps {
    entry: CreateModalEntry
    onRemove: () => void
}

const CreateModal = ({ entry, onRemove }: CreateModalProps) => {
    const { collection, collectionPath, record, depth, onSuccess, trigger, draftKey } = entry
    const { labels } = collection
    const customization = useMemo(() => getCollectionConfigModule(labels.collection), [labels.collection])
    const [recordTitle, setRecordTitle] = useState<string>(labels.record)
    const [open, setOpen] = useState(true)

    const close = () => setOpen(false)

    useEffect(() => {
        const initialize = async () => {
            const collectionAdminPath: ["collections", StokerCollection, "admin"] = [
                "collections",
                labels.collection,
                "admin",
            ]
            const titles = await getCachedConfigValue(customization, [...collectionAdminPath, "titles"])
            setRecordTitle(titles?.record || labels.record)
        }
        initialize()
    }, [labels.collection])

    return (
        <Dialog open={open}>
            <DialogContent
                hideCloseButton
                disableDismiss
                overlayClassName={depth > 1 ? "bg-black/25" : undefined}
                className={createRecordClassName}
                onCloseAutoFocus={(event) => {
                    event.preventDefault()
                    if (trigger?.isConnected) trigger.focus()
                    onRemove()
                }}
            >
                <div className="h-full overflow-y-auto overscroll-contain p-6">
                    <DialogHeader className="flex flex-row items-center justify-between space-y-0 mb-4">
                        <DialogTitle>Create {recordTitle}</DialogTitle>
                        <DialogDescription className="hidden">Create {recordTitle}</DialogDescription>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="Close"
                            onClick={() => {
                                removeDraft(draftKey)
                                close()
                            }}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </DialogHeader>
                    <ModalDepthContext.Provider value={depth}>
                        <RecordForm
                            collection={collection}
                            operation="create"
                            path={collectionPath}
                            record={record}
                            draft
                            draftKey={draftKey}
                            onSuccess={(createdRecord?: StokerRecord) => {
                                close()
                                onSuccess?.(createdRecord)
                            }}
                        />
                    </ModalDepthContext.Provider>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// eslint-disable-next-line react/prop-types
export const CreateProvider: React.FC<CreateProviderProps> = ({ children }) => {
    const [mode] = useMode()
    const [stack, setStack] = useState<CreateModalEntry[]>([])
    const [pending, setPending] = useState<{
        collection: CollectionSchema
        collectionPath: string[]
        record?: StokerRecord
        options?: CreateModalOptions
    } | null>(null)

    const showCreateModal: ShowCreateModal = (collection, collectionPath, record, options) => {
        const trigger = getTriggerElement(options?.trigger)
        if (mode !== "app") {
            setPending({ collection, collectionPath, record, options: { ...options, trigger } })
            return false
        }
        const depth = (options?.parentDepth ?? 0) + 1
        if (depth > MAX_MODAL_DEPTH) return false
        const entry: CreateModalEntry = {
            id: crypto.randomUUID(),
            collection,
            collectionPath:
                collectionPath && collectionPath.length > 0 ? collectionPath : [collection.labels.collection],
            record,
            depth,
            onSuccess: options?.onSuccess,
            trigger,
            draftKey: `${collection.labels.collection}-${depth}`,
        }
        setStack((prev) => (prev.length >= MAX_MODAL_DEPTH ? prev : [...prev, entry]))
        return false
    }

    const removeModal = (id: string) => {
        setStack((prev) => prev.filter((entry) => entry.id !== id))
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
            const { collection, collectionPath, record, options } = pending
            setPending(null)
            showCreateModal(collection, collectionPath, record, options)
        }
    }, [mode, pending])

    return (
        <CreateContext.Provider value={[showCreateModal]}>
            {children}
            {stack.map((entry) => (
                <CreateModal key={entry.id} entry={entry} onRemove={() => removeModal(entry.id)} />
            ))}
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

export const useModalDepth = () => useContext(ModalDepthContext)

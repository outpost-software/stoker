import { CollectionSchema, StokerCollection, StokerRecord } from "@stoker-platform/types"
import { getCurrentUserRoleGroups, getDocumentRefs } from "@stoker-platform/web-client"
import { onSnapshot } from "firebase/firestore"
import { createContext, useContext, useState } from "react"

export const OptimisticContext = createContext<
    | {
          optimisticUpdates: Map<StokerCollection, StokerRecord[]> | undefined
          optimisticDeletes: Map<StokerCollection, string[]> | undefined
          setOptimisticUpdate: (collection: StokerCollection, record: StokerRecord) => void
          setOptimisticDelete: (collection: StokerCollection, id: string) => void
          removeOptimisticUpdate: (collection: StokerCollection, id: string) => void
          removeOptimisticDelete: (collection: StokerCollection, id: string) => void
          removeCacheOptimistic: (collection: CollectionSchema, record: StokerRecord) => void
      }
    | undefined
>(undefined)

interface OptimisticProviderProps {
    children: React.ReactNode
}

// eslint-disable-next-line react/prop-types
export const OptimisticProvider: React.FC<OptimisticProviderProps> = ({ children }) => {
    const [optimisticUpdates, setOptimisticUpdates] = useState<Map<StokerCollection, StokerRecord[]> | undefined>()
    const [optimisticDeletes, setOptimisticDeletes] = useState<Map<StokerCollection, string[]> | undefined>()

    const setOptimisticUpdate = (collection: StokerCollection, record: StokerRecord) => {
        setOptimisticUpdates((prev) => {
            if (!prev) {
                const newMap = new Map<StokerCollection, StokerRecord[]>()
                newMap.set(collection, [record])
                return newMap
            }

            const collectionUpdates = prev.get(collection) || []
            const index = collectionUpdates.findIndex((r: StokerRecord) => r.id === record.id)
            if (index !== -1) {
                // eslint-disable-next-line security/detect-object-injection
                collectionUpdates[index] = record
            } else {
                collectionUpdates.push(record)
            }
            const newMap = new Map(prev)
            newMap.set(collection, collectionUpdates)
            return newMap
        })
    }

    const setOptimisticDelete = (collection: StokerCollection, id: string) => {
        setOptimisticDeletes((prev) => {
            if (!prev) {
                const newMap = new Map<StokerCollection, string[]>()
                newMap.set(collection, [id])
                return newMap
            }

            const collectionDeletes = prev.get(collection) || []
            if (!collectionDeletes.includes(id)) {
                collectionDeletes.push(id)
            }
            const newMap = new Map(prev)
            newMap.set(collection, collectionDeletes)
            return newMap
        })
    }

    const removeOptimisticUpdate = (collection: StokerCollection, id: string) => {
        setOptimisticUpdates((prev) => {
            if (!prev) return
            const collectionUpdates = prev.get(collection) || []
            const index = collectionUpdates.findIndex((r: StokerRecord) => r.id === id)
            if (index !== -1) {
                collectionUpdates.splice(index, 1)
            }
            const newMap = new Map(prev)
            newMap.set(collection, collectionUpdates)
            return newMap
        })
    }

    const removeOptimisticDelete = (collection: StokerCollection, id: string) => {
        setOptimisticDeletes((prev) => {
            if (!prev) return
            const collectionDeletes = prev.get(collection) || []
            const index = collectionDeletes.indexOf(id)
            if (index !== -1) {
                collectionDeletes.splice(index, 1)
            }
            const newMap = new Map(prev)
            newMap.set(collection, collectionDeletes)
            return newMap
        })
    }

    const removeCacheOptimistic = (collection: CollectionSchema, record: StokerRecord) => {
        const { labels } = collection
        const roleGroups = getCurrentUserRoleGroups()
        const roleGroup = roleGroups[labels.collection]
        const refs = getDocumentRefs(record.Collection_Path, record.id, roleGroup)
        const unsubscribes = refs.map((ref) =>
            onSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
                if (!snapshot.metadata.hasPendingWrites) {
                    return
                }
                unsubscribes.forEach((unsubscribe) => unsubscribe())
                removeOptimisticUpdate(labels.collection, record.id)
            }),
        )
    }

    return (
        <OptimisticContext.Provider
            value={{
                optimisticUpdates,
                optimisticDeletes,
                setOptimisticUpdate,
                setOptimisticDelete,
                removeOptimisticUpdate,
                removeOptimisticDelete,
                removeCacheOptimistic,
            }}
        >
            {children}
        </OptimisticContext.Provider>
    )
}

export const useOptimistic = () => {
    const context = useContext(OptimisticContext)
    if (!context) {
        throw new Error("useOptimistic must be used within an OptimisticProvider")
    }
    return context
}

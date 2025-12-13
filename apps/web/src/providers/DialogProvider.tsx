import { createContext, useContext, useState } from "react"
import { DialogContent } from "@stoker-platform/types"

export const DialogContext = createContext<
    | [
          dialogContent: DialogContent | null,
          setDialogContent: React.Dispatch<React.SetStateAction<DialogContent | null>>,
      ]
    | undefined
>(undefined)

interface DialogProviderProps {
    children: React.ReactNode
}

// eslint-disable-next-line react/prop-types
export const DialogProvider: React.FC<DialogProviderProps> = ({ children }) => {
    const [dialogContent, setDialogContent] = useState<DialogContent | null>(null)
    return <DialogContext.Provider value={[dialogContent, setDialogContent]}>{children}</DialogContext.Provider>
}

export const useDialog = () => {
    const context = useContext(DialogContext)
    if (!context) {
        throw new Error("useDialog must be used within a DialogProvider")
    }
    return context
}

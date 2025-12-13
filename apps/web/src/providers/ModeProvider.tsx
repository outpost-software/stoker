import { createContext, useContext, useState } from "react"

export const ModeContext = createContext<
    | [
          mode: "test" | "login" | "ready" | "app" | "maintenance" | undefined,
          setMode: React.Dispatch<React.SetStateAction<"test" | "login" | "ready" | "app" | "maintenance" | undefined>>,
      ]
    | undefined
>(undefined)

interface ModeProviderProps {
    children: React.ReactNode
}

// eslint-disable-next-line react/prop-types
export const ModeProvider: React.FC<ModeProviderProps> = ({ children }) => {
    const [mode, setMode] = useState<"test" | "login" | "ready" | "app" | "maintenance" | undefined>()
    return <ModeContext.Provider value={[mode, setMode]}>{children}</ModeContext.Provider>
}

export const useMode = () => {
    const context = useContext(ModeContext)
    if (!context) {
        throw new Error("useMode must be used within a ModeProvider")
    }
    return context
}

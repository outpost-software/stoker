import { createContext, useContext, useState } from "react"

export const HiddenContext = createContext<
    [config: string[] | undefined, setHidden: React.Dispatch<React.SetStateAction<string[] | undefined>>] | undefined
>(undefined)

interface HiddenProviderProps {
    children: React.ReactNode
}

// eslint-disable-next-line react/prop-types
export const HiddenProvider: React.FC<HiddenProviderProps> = ({ children }) => {
    const [config, setHidden] = useState<string[] | undefined>(undefined)
    return <HiddenContext.Provider value={[config, setHidden]}>{children}</HiddenContext.Provider>
}

export const useHidden = () => {
    const context = useContext(HiddenContext)
    if (!context) {
        throw new Error("useHidden must be used within a HiddenProvider")
    }
    return context
}

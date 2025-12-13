import { createContext, useContext, useState } from "react"

export const ConnectionContext = createContext<
    | [
          connectionStatus: "online" | "offline",
          setConnectionStatus: React.Dispatch<React.SetStateAction<"online" | "offline">>,
      ]
    | undefined
>(undefined)

interface ConnectionProviderProps {
    children: React.ReactNode
}

// eslint-disable-next-line react/prop-types
export const ConnectionProvider: React.FC<ConnectionProviderProps> = ({ children }) => {
    const [connectionStatus, setConnectionStatus] = useState<"online" | "offline">("online")
    return (
        <ConnectionContext.Provider value={[connectionStatus, setConnectionStatus]}>
            {children}
        </ConnectionContext.Provider>
    )
}

export const useConnection = () => {
    const context = useContext(ConnectionContext)
    if (!context) {
        throw new Error("useConnection must be used within a ConnectionProvider")
    }
    return context
}

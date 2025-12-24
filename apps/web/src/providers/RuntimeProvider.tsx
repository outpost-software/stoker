import type { ReactNode } from "react"
import { AssistantRuntimeProvider, useLocalRuntime, type ChatModelAdapter } from "@assistant-ui/react"
import { getFunctions, httpsCallable } from "firebase/functions"
import { getApp } from "firebase/app"
import { CollectionSchema } from "@stoker-platform/types"

const getAdapter = (collection: CollectionSchema) => {
    const MyModelAdapter: ChatModelAdapter = {
        async *run({ messages }) {
            const firebaseFunctions = getFunctions(getApp(), import.meta.env.STOKER_FB_FUNCTIONS_REGION)
            const chatApi = httpsCallable(firebaseFunctions, `stoker-chat${collection.labels.collection.toLowerCase()}`)
            let text = ""
            const { stream } = await chatApi.stream({
                messages,
            })
            for await (const chunk of stream) {
                text += chunk
                yield {
                    content: [{ type: "text", text }],
                }
            }
        },
    }
    return MyModelAdapter
}

export function MyRuntimeProvider({
    children,
    collection,
}: Readonly<{
    children: ReactNode
    collection: CollectionSchema
}>) {
    const runtime = useLocalRuntime(getAdapter(collection))
    return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}

import { StokerCollection } from "@stoker-platform/types"
import { pathToFileURL } from "node:url"

export const getCustomizationFiles = async (path: string, collections: StokerCollection[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modules: any = {}
    for (const collection of collections) {
        const filePath = `${path}/${collection}.js`
        const url = pathToFileURL(filePath).href
        // eslint-disable-next-line security/detect-object-injection
        modules[collection] = await import(/* @vite-ignore */ url)
    }
    return modules
}

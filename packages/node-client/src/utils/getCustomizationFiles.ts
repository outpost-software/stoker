import { StokerCollection } from "@stoker-platform/types"

export const getCustomizationFiles = async (path: string, collections: StokerCollection[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modules: any = {}
    for (const collection of collections) {
        // eslint-disable-next-line security/detect-object-injection
        modules[collection] = await import(/* @vite-ignore */ `${path}/${collection}.js`)
    }
    return modules
}

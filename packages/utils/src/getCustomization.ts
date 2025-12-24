import { CollectionCustomization } from "@stoker-platform/types/src/types/schema"

export const getCustomization = (
    collections: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modules: any,
    sdk: "web" | "node",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    utilities?: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
) => {
    const collectionFiles: { [key: string]: CollectionCustomization } = {}
    for (const collection of collections) {
        // eslint-disable-next-line security/detect-object-injection
        const module = modules[collection]
        const collectionFile: CollectionCustomization = module.default(sdk, utilities, context)
        for (const key in collectionFile) {
            // eslint-disable-next-line security/detect-object-injection
            if (!(key === "custom" || key === "admin" || key === "fields"))
                delete collectionFile[key as keyof CollectionCustomization]
        }
        for (const field of collectionFile.fields) {
            for (const key in field) {
                // eslint-disable-next-line security/detect-object-injection
                if (!(key === "custom" || key === "admin" || key === "name" || key === "formula"))
                    delete field[key as keyof CollectionCustomization["fields"][0]]
            }
        }
        // eslint-disable-next-line security/detect-object-injection
        collectionFiles[collection] = collectionFile
    }
    return collectionFiles
}

import { accessConformance } from "./access.js"
import { collectionConformance } from "./collections.js"
import { editingConformance } from "./editing.js"
import type { ConformanceOptions } from "./options.js"
import { recordConformance } from "./records.js"

export type { ConformanceOptions } from "./options.js"

export const runWebConformance = (options: ConformanceOptions = {}) => {
    if (!options.skip?.access) accessConformance(options)
    if (!options.skip?.collections) collectionConformance(options)
    if (!options.skip?.records) recordConformance(options)
    if (!options.skip?.editing) editingConformance(options)
}

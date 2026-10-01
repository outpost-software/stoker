import { accessConformance } from "./access.js"
import { calendarConformance } from "./calendar.js"
import { collectionConformance } from "./collections.js"
import { editingConformance } from "./editing.js"
import type { ConformanceOptions } from "./options.js"
import { recordConformance } from "./records.js"

export type { ConformanceOptions } from "./options.js"

export const runWebConformance = (options: ConformanceOptions = {}) => {
    if (!options.skip?.access) accessConformance(options)
    if (!options.skip?.editing) editingConformance(options)
    if (!options.skip?.collections) {
        collectionConformance(options)
        calendarConformance(options)
    }
    if (!options.skip?.records) recordConformance(options)
}

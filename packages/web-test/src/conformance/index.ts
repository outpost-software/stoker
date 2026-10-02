import { accessConformance } from "./access.js"
import { assignableConformance } from "./assignable.js"
import { calendarConformance } from "./calendar.js"
import { collectionConformance } from "./collections.js"
import { editingConformance } from "./editing.js"
import type { ConformanceOptions } from "../utils/options.js"
import { fileConformance } from "./files.js"
import { recordConformance } from "./records.js"

export type { ConformanceOptions } from "../utils/options.js"

export const runWebConformance = (options: ConformanceOptions = {}) => {
    if (!options.skip?.access) accessConformance(options)
    if (!options.skip?.editing) editingConformance(options)
    if (!options.skip?.collections) {
        collectionConformance(options)
        calendarConformance(options)
    }
    if (!options.skip?.records) {
        recordConformance(options)
        assignableConformance(options)
        fileConformance(options)
    }
}

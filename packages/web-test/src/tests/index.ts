import { accessConformance } from "./access.js"
import { assignableConformance } from "./assignable.js"
import { calendarConformance } from "./calendar.js"
import { collectionConformance } from "./collections.js"
import { editingConformance } from "./editing.js"
import type { ConformanceOptions } from "../config/options.js"
import { fileConformance } from "./files.js"
import { recordConformance } from "./records.js"

export type { ConformanceOptions, SkippedTest } from "../config/options.js"

export const runWebConformance = (options: ConformanceOptions = {}) => {
    if (!options.skipSuites?.access) accessConformance(options)
    if (!options.skipSuites?.editing) editingConformance(options)
    if (!options.skipSuites?.collections) {
        collectionConformance(options)
        calendarConformance(options)
    }
    if (!options.skipSuites?.records) {
        recordConformance(options)
        assignableConformance(options)
        fileConformance(options)
    }
}

import { PreloadCacheRange } from "@stoker-platform/types"
import { DateTime } from "luxon"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getDateRange = (range: PreloadCacheRange, _timezone: string | undefined) => {
    let start: Date,
        end: Date | undefined = undefined

    if (typeof range.start === "object") {
        start = range.start
    } else {
        start = new Date()

        let startDateTime = DateTime.fromJSDate(start)
        switch (range.start) {
            case "Today":
                startDateTime = startDateTime.startOf("day")
                break
            case "Week":
                startDateTime = startDateTime.startOf("week")
                break
            case "Month":
                startDateTime = startDateTime.startOf("month")
                break
            case "Year":
                startDateTime = startDateTime.startOf("year")
                break
            default:
                startDateTime = startDateTime.startOf("day")
        }

        if (typeof range.start === "number") {
            startDateTime = startDateTime.plus({ days: range.start })
        }

        if (range.startOffsetDays) {
            startDateTime = startDateTime.plus({ days: range.startOffsetDays })
        }
        if (range.startOffsetHours) {
            startDateTime = startDateTime.plus({ hours: range.startOffsetHours })
        }

        start = startDateTime.toJSDate()
    }

    if (typeof range.end === "object") {
        end = range.end
    } else if (range.end) {
        end = new Date()

        let endDateTime = DateTime.fromJSDate(end)

        if (typeof range.end === "number") {
            endDateTime = endDateTime.plus({ days: range.end })
        }

        if (range.endOffsetDays) {
            endDateTime = endDateTime.plus({ days: range.endOffsetDays })
        }
        if (range.endOffsetHours) {
            endDateTime = endDateTime.plus({ hours: range.endOffsetHours })
        }

        end = endDateTime.toJSDate()
    }

    return { start, end }
}

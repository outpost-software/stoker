import { DateTime } from "luxon"
import { getTimezone } from "../initializeStoker"
import { FieldValue, Timestamp } from "firebase/firestore"

export const convertDateToTimezone = (date: Date) => {
    const timezone = getTimezone()
    return DateTime.fromJSDate(date).setZone(timezone)
}

export const convertTimestampToTimezone = (timestamp: Timestamp) => {
    const timezone = getTimezone()
    return DateTime.fromJSDate(timestamp.toDate()).setZone(timezone)
}

export const keepTimezone = (date: Date, timezone: string) => {
    const timezoneDate = DateTime.fromJSDate(date, { zone: timezone })
    const timezoneOffset = timezoneDate.offset
    const localDate = DateTime.fromJSDate(date)
    const localOffset = localDate.offset
    const offset = timezoneOffset - localOffset
    return DateTime.fromJSDate(date).plus({ minutes: offset }).toJSDate()
}

export const removeTimezone = (date: Date, timezone: string) => {
    const timezoneDate = DateTime.fromJSDate(date, { zone: timezone })
    const timezoneOffset = timezoneDate.offset
    const localDate = DateTime.fromJSDate(date)
    const localOffset = localDate.offset
    const offset = timezoneOffset - localOffset
    return DateTime.fromJSDate(date).minus({ minutes: offset }).toJSDate()
}

export const displayDate = (timestamp: Timestamp | FieldValue) => {
    if ("seconds" in timestamp && "nanoseconds" in timestamp) {
        const date = convertTimestampToTimezone(new Timestamp(timestamp.seconds, timestamp.nanoseconds))
        const formattedDate = date.toFormat("MMMM d, yyyy '@' h:mm a")
        return formattedDate
    }
    return ""
}

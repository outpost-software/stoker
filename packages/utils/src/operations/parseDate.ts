import { DateTime } from "luxon"

export const parseDate = (dateString: string) => {
    return DateTime.fromFormat(dateString, "MMMM d, yyyy '@' h:mm a").toMillis()
}

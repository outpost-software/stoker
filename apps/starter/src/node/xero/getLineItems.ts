const salesAccount = 200
const trackingCategory = ""

const prepareLineItem = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lineItem: Record<string, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    line: Record<string, any>,
) => {
    lineItem.description = line.title || "."
    if (line.price) {
        lineItem.unitAmount = line.price
    }
    lineItem.accountCode = salesAccount
    if (line.gst) {
        lineItem.taxType = "OUTPUT"
    } else {
        lineItem.taxType = "EXEMPTOUTPUT"
    }
    if (line.region) {
        lineItem.tracking = {
            trackingCategory: {
                name: trackingCategory,
                option: line.region,
            },
        }
    }
    delete lineItem.lineAmount
    delete lineItem.taxAmount
    return lineItem
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getLineItems = (lineItems: Record<string, any>[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lines: Record<string, any>[] = []
    lineItems.forEach((line) => {
        if (line.price && line.title) {
            if (!line.xeroId) {
                lines.push(prepareLineItem({}, line))
            } else {
                lineItems.forEach((lineItem) => {
                    if (lineItem.lineItemID == line.xeroId) {
                        lines.push(prepareLineItem(lineItem, line))
                    }
                })
            }
        }
    })
    return lines
}

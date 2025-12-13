import type { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { useEffect, useMemo, useState } from "react"
import { DateTime } from "luxon"
import { getOne } from "@stoker-platform/web-client"

type Section = {
    title: string
    order: number
    notes?: string
    showTitle?: boolean
    showTotals?: boolean
}

type LineItem = {
    section: number
    title: string
    price: number
    gst: boolean
}

export const Preview = ({
    record,
    collection,
    utils,
}: {
    record: StokerRecord | undefined
    collection: CollectionSchema
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    components: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hooks: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    utils: any
}) => {
    const clientCollection = "Companies"
    const clientField = "Company"
    const logoUrl =
        "data:image/png;base64,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"
    const logoWidth = "max-w-[100px]"
    const billingAddress = `Mastercare Australasia Pty Ltd
ABN: 99 091 788 233
PO Box 340
Unit 3, 15-17 Chaplin Drive
Lane Cove NSW 2066
mastercare@mastercare.com.au
Ph: 02 9429 6200
Fax: 02 9429 6299`
    const paymentInfo = "Bank Account: 1234567890\nBSB: 123456\nAccount Number: 1234567890"
    const tax = true
    const prefixes = {
        Quotes: null,
        Invoices: null,
    }
    const timezone = "Australia/Melbourne"

    const { cn } = utils["./lib/utils.ts"]

    const { labels } = collection

    const [company, setCompany] = useState<StokerRecord | undefined>(undefined)

    useEffect(() => {
        if (!record) return
        const getRecords = async () => {
            const companyRecord = await getOne([clientCollection], record[`${clientField}_Array`][0])
            setCompany(companyRecord)
        }
        getRecords()
    }, [record])

    const orderedSections = useMemo(() => {
        if (!record?.Billing_Sections) return []
        return record.Billing_Sections?.sort((a: Section, b: Section) => a.order - b.order)
    }, [record?.Billing_Sections])

    const totalsBySection = useMemo(() => {
        if (!record?.Billing_Line_Items) return {}
        const result = Object.create(null) as Record<number, { subtotal: number; gst: number; total: number }>
        /* eslint-disable security/detect-object-injection */
        for (const section of orderedSections) {
            const orderKey = Number.isFinite(section.order) ? Math.floor(section.order) : 0
            if (!Object.prototype.hasOwnProperty.call(result, orderKey)) {
                result[orderKey] = { subtotal: 0, gst: 0, total: 0 }
            }
        }
        for (const item of record.Billing_Line_Items || []) {
            const rawKey = item.section as unknown
            const key = Number.isFinite(rawKey as number) ? Math.floor(rawKey as number) : 0
            if (key < 0) continue
            if (!Object.prototype.hasOwnProperty.call(result, key)) {
                result[key] = { subtotal: 0, gst: 0, total: 0 }
            }
            const price = Number.isFinite(item.price) ? item.price : 0
            const newSubtotal = result[key].subtotal + price
            if (!Number.isFinite(newSubtotal)) {
                throw new Error("Numeric overflow detected in billing calculation")
            }
            result[key].subtotal = newSubtotal
            if (item.gst) {
                const newGst = result[key].gst + price * 0.1
                if (!Number.isFinite(newGst)) {
                    throw new Error("Numeric overflow detected in billing calculation")
                }
                result[key].gst = newGst
            }
            const newTotal = result[key].subtotal + result[key].gst
            if (!Number.isFinite(newTotal)) {
                throw new Error("Numeric overflow detected in billing calculation")
            }
            result[key].total = newTotal
        }
        /* eslint-enable security/detect-object-injection */
        return result
    }, [orderedSections])

    const grandTotals = useMemo(() => {
        const subtotal = Object.values(totalsBySection).reduce((acc, totals) => {
            const newAcc = acc + totals.subtotal
            if (!Number.isFinite(newAcc)) {
                throw new Error("Numeric overflow detected in billing calculation")
            }
            return newAcc
        }, 0)
        const gst = Object.values(totalsBySection).reduce((acc, totals) => {
            const newAcc = acc + totals.gst
            if (!Number.isFinite(newAcc)) {
                throw new Error("Numeric overflow detected in billing calculation")
            }
            return newAcc
        }, 0)
        const newTotal = subtotal + gst
        if (!Number.isFinite(newTotal)) {
            throw new Error("Numeric overflow detected in billing calculation")
        }
        return { subtotal, gst, total: newTotal }
    }, [totalsBySection])

    const currency = (value: number) =>
        `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

    const getIssuedDate = (record: StokerRecord | undefined) => {
        if (!record?.Issued_Date) return ""
        return DateTime.fromJSDate(record.Issued_Date.toDate()).setZone(timezone).toFormat("D")
    }

    const getDueDate = (record: StokerRecord | undefined) => {
        if (!record?.Due_Date) return ""
        return DateTime.fromJSDate(record.Due_Date.toDate()).setZone(timezone).toFormat("D")
    }

    const isOverdue = () => {
        if (!record) return false
        return record.Status !== "Paid" && record.Due_Date && record.Due_Date.toDate() < new Date()
    }

    if (!record || !company) return null

    return (
        <>
            <div className="text-center text-sm sm:hidden">
                <p>Please rotate your device to view in landscape mode.</p>
            </div>
            <div>
                <div className="hidden sm:block max-w-[210mm] min-h-[297mm] bg-white text-black text-sm rounded-sm border border-gray-200 py-[30px] px-[30px]">
                    <table className="w-full border-0 border-collapse">
                        <tbody>
                            <tr className="align-top">
                                <td>
                                    <img
                                        className={cn("h-auto md:w-[200px]", logoWidth || "max-w-[250px]")}
                                        src={logoUrl}
                                    />
                                    <p>
                                        {" "}
                                        <br />
                                    </p>
                                    <table className="border-0 border-collapse">
                                        <tbody>
                                            <tr>
                                                <td>&nbsp;</td>
                                            </tr>
                                            {record.Billing_Heading && (
                                                <tr>
                                                    <td>
                                                        <div className="max-w-[250px]">
                                                            <b>{record.Billing_Heading}</b>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr>
                                                <td>
                                                    <div className="max-w-[250px]">
                                                        <b>{company?.Name || ""}</b>
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    {record.Billing_Att && record.Billing_Att !== "" && (
                                                        <div>Att: {record.Billing_Att}</div>
                                                    )}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td>&nbsp;</td>
                                            </tr>
                                            <tr>
                                                {record.Billing_Address && (
                                                    <td className="w-[200px] align-top">
                                                        <b>Billing Address: </b>
                                                        <br />
                                                        <p className="whitespace-pre-wrap">{record.Billing_Address}</p>
                                                    </td>
                                                )}
                                                <td className={cn(record.Billing_Address && "pl-12", "align-top")}>
                                                    {record.Billing_Site && (
                                                        <span>
                                                            <b>Site:</b>
                                                            <p className="whitespace-pre-wrap">{record.Billing_Site}</p>
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <br />
                                    <table>
                                        <tbody>
                                            <tr>
                                                <td>
                                                    {labels.collection === "Invoices" && (
                                                        <h1 className="text-3xl">{tax && <span>TAX </span>}INVOICE</h1>
                                                    )}
                                                    {labels.collection === "Quotes" && (
                                                        <h1 className="text-3xl">QUOTATION</h1>
                                                    )}
                                                </td>
                                            </tr>
                                            {record && isOverdue() && labels.collection === "Invoices" && (
                                                <tr>
                                                    <td>
                                                        <h3 className="text-red-500">OVERDUE</h3>
                                                    </td>
                                                </tr>
                                            )}
                                            <tr>
                                                <td>&nbsp;</td>
                                            </tr>
                                            <tr>
                                                <td>
                                                    <b> {labels.collection} #: </b>
                                                    {prefixes[labels.collection as "Quotes" | "Invoices"] && (
                                                        <span>
                                                            {prefixes[labels.collection as "Quotes" | "Invoices"]}
                                                        </span>
                                                    )}
                                                    {record.Number}
                                                </td>
                                            </tr>
                                            <tr>
                                                {record && (
                                                    <td>
                                                        <b> Issue Date: </b>
                                                        {getIssuedDate(record)}
                                                    </td>
                                                )}
                                            </tr>
                                            {labels.collection === "Invoices" && (
                                                <tr>
                                                    {record && (
                                                        <td>
                                                            <b> Due Date: </b>
                                                            {getDueDate(record)}
                                                        </td>
                                                    )}
                                                </tr>
                                            )}
                                            <tr>
                                                <td>&nbsp;</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                                <td className="text-right min-w-[200px]">
                                    <p className="whitespace-pre-wrap first-line:font-bold">{billingAddress}</p>
                                    <p>&nbsp;</p>
                                    <p>&nbsp;</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    <table className="w-full">
                        <tbody>
                            {orderedSections.map((section: Section) => (
                                <tr key={`section-${section.order}`}>
                                    <td>
                                        <table className="w-full mb-0 border-collapse">
                                            <tbody>
                                                <tr>
                                                    <th className="border-b border-gray-200 pt-5 pb-2 pr-5 pl-0 w-full text-[#427bca] text-left">
                                                        {section.showTitle && <span>{section.title}</span>}
                                                    </th>
                                                    <th className="border-b border-gray-200 pt-5 pb-2 min-w-[85px] text-right text-[#427bca]">
                                                        Price
                                                    </th>
                                                    {tax && (
                                                        <th className="border-b border-gray-200 pt-5 pb-2 min-w-[110px] text-right text-[#427bca]">
                                                            GST
                                                        </th>
                                                    )}
                                                </tr>
                                                {record.Billing_Line_Items.filter(
                                                    (line: LineItem) => line.section === section.order,
                                                ).map((line: LineItem) => (
                                                    <tr key={`section-line-${line.title}`}>
                                                        <td className="py-[5px] pr-[25px] pl-0 whitespace-pre-wrap w-full border-t border-gray-200">
                                                            {line.title}
                                                        </td>
                                                        <td className="py-[5px] min-w-[85px] text-right border-t border-gray-200">
                                                            {currency(line.price)}
                                                        </td>
                                                        {tax && (
                                                            <td className="py-[5px] min-w-[110px] text-right border-t border-gray-200">
                                                                {tax && (
                                                                    <>
                                                                        {line.gst && (
                                                                            <span>{currency(line.price / 10)}</span>
                                                                        )}
                                                                        {!line.gst && <span>-</span>}
                                                                    </>
                                                                )}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {!section.showTotals && section.notes && (
                                            <div className="border-t border-gray-200 pt-5 pr-5 pb-0 pl-0">
                                                <p className="text-left whitespace-pre-wrap">
                                                    <em>{section.notes}</em>
                                                </p>
                                            </div>
                                        )}
                                        {section.showTotals && (
                                            <div className="border-t border-gray-200 pt-5">
                                                <div className="flex items-start gap-8">
                                                    {section.notes && (
                                                        <div className="pr-5 pl-0 max-w-[400px]">
                                                            <p className="text-left whitespace-pre-wrap">
                                                                <em>{section.notes}</em>
                                                            </p>
                                                        </div>
                                                    )}
                                                    <div className="ml-auto">
                                                        <table className="mb-12">
                                                            <tbody>
                                                                {tax && (
                                                                    <tr>
                                                                        <td className="border-t-0 py-[5px] min-w-[85px] text-right">
                                                                            <b>Subtotal: </b>
                                                                        </td>
                                                                        <td className="border-t-0 py-[5px] min-w-[110px] text-right">
                                                                            {currency(
                                                                                totalsBySection[section.order].subtotal,
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                                {tax && (
                                                                    <tr>
                                                                        <td className="py-[5px] min-w-[85px] text-right border-t border-gray-200">
                                                                            <b>GST @ 10% </b>
                                                                        </td>
                                                                        <td className="py-[5px] min-w-[110px] text-right border-t border-gray-200">
                                                                            {currency(
                                                                                totalsBySection[section.order].gst,
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                                <tr>
                                                                    <td className="py-[5px] min-w-[85px] text-right border-t border-gray-200">
                                                                        <b>Total: </b>
                                                                    </td>
                                                                    <td className="py-[5px] min-w-[110px] text-right border-t border-gray-200">
                                                                        {currency(totalsBySection[section.order].total)}
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {record.Billing_Show_Totals && (
                        <div className="flex items-start gap-8 mt-5 mb-5">
                            {record.Billing_Footnotes && record.Billing_Footnotes !== "" && (
                                <div className="max-w-[400px] whitespace-pre-wrap">
                                    <em>{record.Billing_Footnotes}</em>
                                </div>
                            )}
                            <div className="ml-auto">
                                <table>
                                    <tbody>
                                        {tax && (
                                            <tr>
                                                <td className="border-t-0 pb-[8px] pt-0 pr-0 pl-0 min-w-[85px] text-[#427bca] text-right">
                                                    <b>Subtotal: </b>
                                                </td>
                                                <td className="border-t-0 pb-[8px] pt-0 pr-0 pl-0 text-right min-w-[110px]">
                                                    <b>{currency(grandTotals.subtotal)}</b>
                                                </td>
                                            </tr>
                                        )}
                                        {tax && (
                                            <tr>
                                                <td className="py-2 min-w-[85px] text-[#427bca] text-right border-t border-gray-200">
                                                    <b>GST @ 10% </b>
                                                </td>
                                                <td className="py-2 text-right min-w-[110px] border-t border-gray-200">
                                                    <b>{currency(grandTotals.gst)}</b>
                                                </td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td className="py-2 min-w-[85px] text-[#427bca] text-right border-t border-gray-200">
                                                <b>Total: </b>
                                            </td>
                                            <td className="py-2 text-right min-w-[110px] border-t border-gray-200">
                                                <b>{currency(grandTotals.total)}</b>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {!record.Billing_Show_Totals && record.Billing_Footnotes && record.Billing_Footnotes !== "" && (
                        <div className="max-w-[400px] whitespace-pre-wrap mt-5">
                            <em>{record.Billing_Footnotes}</em>
                        </div>
                    )}
                    {labels.collection === "Invoices" && (
                        <p className="max-w-[500px] whitespace-pre-wrap">{paymentInfo}</p>
                    )}
                </div>
            </div>
        </>
    )
}

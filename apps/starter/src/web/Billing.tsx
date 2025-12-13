import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router"
import type { CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { getOne, updateRecord } from "@stoker-platform/web-client"
import { Plus, X, ChevronUp, ChevronDown } from "lucide-react"

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

const currency = (value: number) =>
    `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const getCapitalisedPath = (path: string) => {
    return path.split("-").map((element, index) => {
        if ((index + 1) % 2 === 0) return element
        return element
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join("_")
    })
}

export const getTotalsBySection = (sections: Section[], lineItems: LineItem[]) => {
    const result = Object.create(null) as Record<number, { subtotal: number; gst: number; total: number }>
    /* eslint-disable security/detect-object-injection */
    for (const section of sections) {
        const orderKey = Number.isFinite(section.order) ? Math.floor(section.order) : 0
        if (!Object.prototype.hasOwnProperty.call(result, orderKey)) {
            result[orderKey] = { subtotal: 0, gst: 0, total: 0 }
        }
    }
    for (const item of lineItems) {
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
}

export const Billing = ({
    record,
    components,
    hooks,
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
    const { Label } = components["./components/ui/label.tsx"]
    const { Input } = components["./components/ui/input.tsx"]
    const { Textarea } = components["./components/ui/textarea.tsx"]
    const { Button } = components["./components/ui/button.tsx"]
    const { Checkbox } = components["./components/ui/checkbox.tsx"]
    const { useToast } = hooks["./hooks/use-toast.ts"]

    const { path: pathString, id } = useParams()
    const { toast } = useToast()

    const [company, setCompany] = useState<StokerRecord | undefined>(undefined)
    const [site, setSite] = useState<StokerRecord | undefined>(undefined)

    const [heading, setHeading] = useState<string>("")
    const [att, setAtt] = useState<string>("")
    const [billingAddress, setBillingAddress] = useState<string>("")
    const [siteAddress, setSiteAddress] = useState<string>("")

    const [sections, setSections] = useState<Section[]>([])
    const [lineItems, setLineItems] = useState<LineItem[]>([])
    const [priceInputs, setPriceInputs] = useState<Record<number, string>>({})

    const [showTotalsGlobal, setShowTotalsGlobal] = useState<boolean>(true)
    const [footnotes, setFootnotes] = useState<string>("")

    const [isSaving, setIsSaving] = useState(false)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!record) return
        setHeading(record.Billing_Heading || "")
        setAtt(record.Billing_Att || "")
        setBillingAddress(record.Billing_Address || "")
        setSiteAddress(record.Billing_Site || "")
        setSections(record.Billing_Sections || [])
        setLineItems(record.Billing_Line_Items || [])
        setShowTotalsGlobal(record.Billing_Show_Totals ?? true)
        setFootnotes(record.Billing_Footnotes || "")
    }, [record?.id])

    useEffect(() => {
        if (!record) return
        const getRecords = async () => {
            const companyRecord = await getOne(["Companies"], record.Company_Array[0])
            setCompany(companyRecord)
            if (record.Site_Array?.length > 0) {
                const siteRecord = await getOne(["Sites"], record.Site_Array[0])
                setSite(siteRecord)
            }
            setIsLoading(false)
        }
        getRecords()
    }, [record])

    const totalsBySection = useMemo(() => {
        return getTotalsBySection(sections, lineItems)
    }, [sections, lineItems])

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

    const addSection = () => {
        const nextOrder = sections.length
        setSections([...sections, { title: "", notes: "", order: nextOrder, showTitle: true, showTotals: true }])
    }

    const removeSection = (order: number) => {
        const remainingSections = sections.filter((section) => section.order !== order)
        const reindexed = remainingSections.map((section, index) => ({ ...section, order: index }))
        setSections(reindexed)
        setLineItems(
            lineItems
                .filter((lineItem) => lineItem.section !== order)
                .map((lineItem) => ({
                    ...lineItem,
                    section: Math.max(0, Math.min(lineItem.section, reindexed.length - 1)),
                })),
        )
    }

    const moveSection = (order: number, direction: "up" | "down") => {
        const index = sections.findIndex((section) => section.order === order)
        if (index < 0) return
        const newIndex = direction === "up" ? index - 1 : index + 1
        if (newIndex < 0 || newIndex >= sections.length) return
        const next = [...sections]
        const [moved] = next.splice(index, 1)
        next.splice(newIndex, 0, moved)
        const reindexed = next.map((section, index) => ({ ...section, order: index }))
        const sectionMap: Record<number, number> = {}
        sections.forEach((section) => {
            const newOrder = reindexed.findIndex(
                (indexedSection) => indexedSection.title === section.title && indexedSection.notes === section.notes,
            )
            sectionMap[section.order] = newOrder >= 0 ? newOrder : section.order
        })
        setSections(reindexed)
        setLineItems(
            lineItems.map((lineItem) => ({
                ...lineItem,
                section: sectionMap[lineItem.section] ?? lineItem.section,
            })),
        )
    }

    const addLineItem = (sectionOrder: number) => {
        setLineItems([...lineItems, { section: sectionOrder, title: "", price: 0, gst: true }])
    }

    const removeLineItem = (index: number) => {
        setLineItems(lineItems.filter((_, i) => i !== index))
        setPriceInputs((prev) => {
            const next: Record<number, string> = {}
            for (const key in prev) {
                const k = Number(key)
                if (!Number.isFinite(k)) continue
                // eslint-disable-next-line security/detect-object-injection
                if (k < index) next[k] = prev[k]
                // eslint-disable-next-line security/detect-object-injection
                else if (k > index) next[k - 1] = prev[k]
            }
            return next
        })
    }

    const handleSave = async () => {
        if (!id || !pathString) return
        setIsSaving(true)
        const path = getCapitalisedPath(pathString)
        const data = {
            Billing_Heading: heading,
            Billing_Att: att,
            Billing_Address: billingAddress,
            Billing_Site: siteAddress,
            Billing_Sections: sections.map((section) => ({
                title: section.title,
                notes: section.notes || "",
                order: section.order,
                showTitle: !!section.showTitle,
                showTotals: !!section.showTotals,
            })),
            Billing_Line_Items: lineItems.map((lineItem) => ({
                section: Number(lineItem.section) || 0,
                title: lineItem.title,
                price: Number(lineItem.price) || 0,
                gst: !!lineItem.gst,
            })),
            Billing_Show_Totals: !!showTotalsGlobal,
            Billing_Footnotes: footnotes,
        }
        try {
            await updateRecord(path, id, data)
            toast({
                title: "Success",
                description: "Billing details saved",
            })
        } catch (error) {
            console.error(error)
            toast({
                title: "Error",
                description: "Failed to save billing details",
                variant: "destructive",
            })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        !isLoading && (
            <div className="max-w-[750px]">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Customer Details</h2>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-primary">Heading</Label>
                        <Input
                            value={heading}
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setHeading(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-primary">Att</Label>
                        <Input
                            value={att}
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAtt(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-primary">Billing Address</Label>
                        <div>
                            <Textarea
                                rows={3}
                                value={billingAddress}
                                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                                    setBillingAddress(event.target.value)
                                }
                            />
                            {company?.Address && (
                                <Button
                                    variant="link"
                                    className="whitespace-normal break-words text-left p-0 text-blue-500"
                                    onClick={() => setBillingAddress(company.Address)}
                                >
                                    Copy address from attached Company "{company.Name}"
                                </Button>
                            )}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-primary">Site Name / Address</Label>
                        <div>
                            <Textarea
                                rows={3}
                                value={siteAddress}
                                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                                    setSiteAddress(event.target.value)
                                }
                            />
                            {site && (
                                <Button
                                    variant="link"
                                    className="whitespace-normal break-words text-left p-0 text-blue-500"
                                    onClick={() => setSiteAddress(`${site.Name}\n${site.Address ? site.Address : ""}`)}
                                >
                                    Copy address from attached Site "{site.Name}"
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-8">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-semibold">Sections</h2>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={addSection}
                            className="inline-flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Add Section
                        </Button>
                    </div>

                    <div className="space-y-6">
                        {sections.map((section) => {
                            const sectionLines = lineItems
                                .map((lineItem, index) => ({ ...lineItem, __index: index }))
                                .filter((lineItem) => lineItem.section === section.order)
                            const totals = totalsBySection[section.order] || { subtotal: 0, gst: 0, total: 0 }
                            return (
                                <div
                                    key={section.order}
                                    className="border rounded-lg p-4 bg-blue-500 dark:bg-blue-500/80 text-white"
                                >
                                    <div className="flex items-center">
                                        <div className="flex-1 space-y-2">
                                            <Label>Section Title</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    value={section.title}
                                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                                        setSections(
                                                            sections.map((currentSection) =>
                                                                currentSection.order === section.order
                                                                    ? { ...currentSection, title: event.target.value }
                                                                    : currentSection,
                                                            ),
                                                        )
                                                    }
                                                    className="bg-white text-black"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => moveSection(section.order, "up")}
                                                        aria-label="Move up"
                                                        className="bg-white text-black"
                                                    >
                                                        <ChevronUp className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        onClick={() => moveSection(section.order, "down")}
                                                        aria-label="Move down"
                                                        className="bg-white text-black"
                                                    >
                                                        <ChevronDown className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="bg-white text-destructive"
                                                        onClick={() => removeSection(section.order)}
                                                        aria-label="Remove section"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex items-center gap-4">
                                                <label className="inline-flex items-center gap-2">
                                                    <Checkbox
                                                        checked={!!section.showTitle}
                                                        onCheckedChange={(checked: boolean) =>
                                                            setSections(
                                                                sections.map((currentSection) =>
                                                                    currentSection.order === section.order
                                                                        ? { ...currentSection, showTitle: !!checked }
                                                                        : currentSection,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                    <span className="text-sm">Show section title</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="flex items-center justify-between mb-2 text-black">
                                            <div className="font-medium text-white">Line Items</div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="inline-flex items-center gap-2 bg-white text-black"
                                                onClick={() => addLineItem(section.order)}
                                            >
                                                <Plus className="w-4 h-4" /> Add Line
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            {sectionLines.map((line) => (
                                                <div
                                                    key={line.__index}
                                                    className="flex flex-col items-end md:flex-row md:items-center gap-2"
                                                >
                                                    <Input
                                                        className="flex-1 bg-white text-black"
                                                        placeholder="Line Item"
                                                        value={line.title}
                                                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                                            setLineItems(
                                                                lineItems.map((lineItem, index) =>
                                                                    index === line.__index
                                                                        ? { ...lineItem, title: event.target.value }
                                                                        : lineItem,
                                                                ),
                                                            )
                                                        }
                                                    />
                                                    <Input
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="w-28 text-right bg-white text-black"
                                                        value={
                                                            priceInputs[line.__index] !== undefined
                                                                ? priceInputs[line.__index]
                                                                : Number.isFinite(line.price)
                                                                  ? line.price.toFixed(2)
                                                                  : ""
                                                        }
                                                        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                                            const raw = event.target.value
                                                            setPriceInputs({
                                                                ...priceInputs,
                                                                [line.__index]: raw,
                                                            })
                                                            const cleaned = raw.replace(/[^0-9.-]/g, "")
                                                            const parsed = cleaned === "" ? NaN : Number(cleaned)
                                                            setLineItems(
                                                                lineItems.map((lineItem, index) =>
                                                                    index === line.__index
                                                                        ? {
                                                                              ...lineItem,
                                                                              price: Number.isFinite(parsed)
                                                                                  ? parsed
                                                                                  : 0,
                                                                          }
                                                                        : lineItem,
                                                                ),
                                                            )
                                                        }}
                                                        onBlur={() => {
                                                            const current = priceInputs[line.__index]
                                                            const cleaned = (current ?? "").replace(/[^0-9.-]/g, "")
                                                            const parsed = cleaned === "" ? 0 : Number(cleaned)
                                                            const formatted = Number.isFinite(parsed)
                                                                ? parsed.toFixed(2)
                                                                : "0.00"
                                                            setPriceInputs({
                                                                ...priceInputs,
                                                                [line.__index]: formatted,
                                                            })
                                                        }}
                                                    />
                                                    <label className="inline-flex items-center gap-2 whitespace-nowrap mr-2">
                                                        <Checkbox
                                                            checked={!!line.gst}
                                                            onCheckedChange={(checked: boolean) =>
                                                                setLineItems(
                                                                    lineItems.map((lineItem, index) =>
                                                                        index === line.__index
                                                                            ? {
                                                                                  ...lineItem,
                                                                                  gst: !!checked,
                                                                              }
                                                                            : lineItem,
                                                                    ),
                                                                )
                                                            }
                                                        />
                                                        <span>GST</span>
                                                    </label>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        className="bg-white text-destructive"
                                                        onClick={() => removeLineItem(line.__index)}
                                                        aria-label="Remove line"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="mt-3 space-y-2">
                                        <Label>Section Notes</Label>
                                        <Textarea
                                            rows={3}
                                            value={section.notes || ""}
                                            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                                                setSections(
                                                    sections.map((currentSection) =>
                                                        currentSection.order === section.order
                                                            ? { ...currentSection, notes: event.target.value }
                                                            : currentSection,
                                                    ),
                                                )
                                            }
                                            className="bg-white text-black"
                                        />
                                    </div>

                                    <div className="flex justify-end">
                                        <div className="mt-4 pt-3 text-sm">
                                            <div className="font-semibold text-right">Section Totals</div>
                                            <div className="flex flex-col gap-1 mt-1">
                                                <div className="flex justify-end">
                                                    <span className="font-medium mr-2">Subtotal: </span>
                                                    <span>{currency(totals.subtotal)}</span>
                                                </div>
                                                <div className="flex justify-end">
                                                    <span className="font-medium mr-2">GST: </span>
                                                    <span>{currency(totals.gst)}</span>
                                                </div>
                                                <div className="flex justify-end">
                                                    <span className="font-medium mr-2">Total: </span>
                                                    <span>{currency(totals.total)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <label className="inline-flex items-center justify-end w-full gap-2 mt-2">
                                        <Checkbox
                                            checked={section.showTotals ?? true}
                                            onCheckedChange={(checked: boolean) =>
                                                setSections(
                                                    sections.map((currentSection) =>
                                                        currentSection.order === section.order
                                                            ? { ...currentSection, showTotals: !!checked }
                                                            : currentSection,
                                                    ),
                                                )
                                            }
                                        />
                                        <span className="text-sm">Show section totals</span>
                                    </label>
                                </div>
                            )
                        })}
                        {sections.length === 0 && <div className="text-sm text-muted-foreground">No sections yet</div>}
                    </div>
                </div>

                <div className="mt-8">
                    <h2 className="text-xl font-semibold mb-2">Totals</h2>
                    <div className="space-y-1 text-sm">
                        <div>
                            <span className="font-medium">Subtotal: </span>
                            <span>{currency(grandTotals.subtotal)}</span>
                        </div>
                        <div>
                            <span className="font-medium">GST: </span>
                            <span>{currency(grandTotals.gst)}</span>
                        </div>
                        <div>
                            <span className="font-medium">Total: </span>
                            <span>{currency(grandTotals.total)}</span>
                        </div>
                    </div>
                    <div className="mt-3">
                        <label className="inline-flex items-center gap-2">
                            <Checkbox
                                checked={showTotalsGlobal}
                                onCheckedChange={(checked: boolean) => setShowTotalsGlobal(!!checked)}
                            />
                            <span className="text-sm">Show totals</span>
                        </label>
                    </div>
                    <div className="mt-4 space-y-2">
                        <Label className="text-primary">Footnotes</Label>
                        <Textarea
                            rows={4}
                            value={footnotes}
                            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                                setFootnotes(event.target.value)
                            }
                        />
                    </div>
                </div>
                <div className="flex justify-end mt-4">
                    <Button type="button" onClick={handleSave} disabled={isSaving}>
                        Save
                    </Button>
                </div>
            </div>
        )
    )
}

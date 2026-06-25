import { format, getYear, isSameYear, setYear, startOfToday } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "./button"

const YEARS_PER_PAGE = 12
const GRID_COLUMNS = 3

interface YearPickerProps {
    currentMonth: Date
    onYearChange: (newMonth: Date) => void
    disabled?: boolean
    fromYear?: number
    toYear?: number
}

export default function YearPicker({
    currentMonth,
    onYearChange,
    disabled,
    fromYear = 1900,
    toYear = 2100,
}: YearPickerProps) {
    const currentYear = getYear(currentMonth)
    const [startYear, setStartYear] = React.useState(() => Math.floor(currentYear / YEARS_PER_PAGE) * YEARS_PER_PAGE)
    const yearButtonRefs = React.useRef<(HTMLButtonElement | null)[]>([])

    const years = Array.from({ length: YEARS_PER_PAGE }, (_, index) => startYear + index)

    const isYearDisabled = React.useCallback(
        (year: number) => disabled || year < fromYear || year > toYear,
        [disabled, fromYear, toYear],
    )

    const getFirstFocusableIndex = React.useCallback(() => {
        const selectedIndex = years.indexOf(currentYear)
        // eslint-disable-next-line security/detect-object-injection
        if (selectedIndex >= 0 && !isYearDisabled(years[selectedIndex])) {
            return selectedIndex
        }
        return years.findIndex((year) => !isYearDisabled(year))
    }, [years, currentYear, isYearDisabled])

    const [focusedIndex, setFocusedIndex] = React.useState(0)

    React.useEffect(() => {
        setStartYear(Math.floor(getYear(currentMonth) / YEARS_PER_PAGE) * YEARS_PER_PAGE)
    }, [currentMonth])

    React.useEffect(() => {
        setFocusedIndex(getFirstFocusableIndex())
    }, [startYear, getFirstFocusableIndex])

    React.useEffect(() => {
        // eslint-disable-next-line security/detect-object-injection
        yearButtonRefs.current[focusedIndex]?.focus()
    }, [focusedIndex])

    const today = startOfToday()

    function previousPage() {
        setStartYear((year) => Math.max(fromYear, year - YEARS_PER_PAGE))
    }

    function nextPage() {
        setStartYear((year) => Math.min(toYear - YEARS_PER_PAGE + 1, year + YEARS_PER_PAGE))
    }

    function getNextFocusableIndex(index: number, step: number) {
        let nextIndex = index + step
        while (nextIndex >= 0 && nextIndex < years.length) {
            // eslint-disable-next-line security/detect-object-injection
            if (!isYearDisabled(years[nextIndex])) {
                return nextIndex
            }
            nextIndex += step
        }
        return index
    }

    function handleYearKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number, year: number) {
        const yearDate = setYear(currentMonth, year)

        switch (event.key) {
            case "ArrowRight":
                event.preventDefault()
                setFocusedIndex(getNextFocusableIndex(index, 1))
                break
            case "ArrowLeft":
                event.preventDefault()
                setFocusedIndex(getNextFocusableIndex(index, -1))
                break
            case "ArrowDown": {
                event.preventDefault()
                const column = index % GRID_COLUMNS
                let nextRow = Math.floor(index / GRID_COLUMNS) + 1
                const totalRows = Math.ceil(years.length / GRID_COLUMNS)
                while (nextRow < totalRows) {
                    const nextIndex = nextRow * GRID_COLUMNS + column
                    // eslint-disable-next-line security/detect-object-injection
                    if (nextIndex < years.length && !isYearDisabled(years[nextIndex])) {
                        setFocusedIndex(nextIndex)
                        return
                    }
                    nextRow++
                }
                break
            }
            case "ArrowUp": {
                event.preventDefault()
                const column = index % GRID_COLUMNS
                let nextIndex = index - GRID_COLUMNS
                while (nextIndex >= 0) {
                    const alignedIndex = Math.floor(nextIndex / GRID_COLUMNS) * GRID_COLUMNS + column
                    // eslint-disable-next-line security/detect-object-injection
                    if (!isYearDisabled(years[alignedIndex])) {
                        setFocusedIndex(alignedIndex)
                        return
                    }
                    nextIndex -= GRID_COLUMNS
                }
                break
            }
            case "Home":
                event.preventDefault()
                setFocusedIndex(getFirstFocusableIndex())
                break
            case "End": {
                event.preventDefault()
                for (let endIndex = years.length - 1; endIndex >= 0; endIndex--) {
                    // eslint-disable-next-line security/detect-object-injection
                    if (!isYearDisabled(years[endIndex])) {
                        setFocusedIndex(endIndex)
                        break
                    }
                }
                break
            }
            case "PageUp":
                event.preventDefault()
                previousPage()
                break
            case "PageDown":
                event.preventDefault()
                nextPage()
                break
            case "Enter":
            case " ":
                event.preventDefault()
                if (!isYearDisabled(year)) {
                    onYearChange(yearDate)
                }
                break
        }
    }

    return (
        <div className="w-fit p-3">
            <div className="flex w-fit flex-col space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
                <div className="space-y-4">
                    <div className="relative flex w-56 items-center justify-center pt-1">
                        <div className="text-sm font-medium" aria-live="polite" role="presentation" id="year-picker">
                            {startYear} – {startYear + YEARS_PER_PAGE - 1}
                        </div>
                        <div className="flex items-center space-x-1">
                            <button
                                name="previous-years"
                                aria-label="Go to previous years"
                                className={cn(
                                    buttonVariants({ variant: "outline" }),
                                    "absolute left-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                                )}
                                type="button"
                                onClick={previousPage}
                                disabled={disabled || startYear <= fromYear}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                name="next-years"
                                aria-label="Go to next years"
                                className={cn(
                                    buttonVariants({ variant: "outline" }),
                                    "absolute right-1 h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
                                )}
                                type="button"
                                onClick={nextPage}
                                disabled={disabled || startYear + YEARS_PER_PAGE - 1 >= toYear}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="grid w-56 grid-cols-3 gap-2" role="grid" aria-labelledby="year-picker">
                        {years.map((year, index) => {
                            const yearDate = setYear(currentMonth, year)
                            const isSelected = isSameYear(yearDate, currentMonth)
                            const isCurrentYear = isSameYear(yearDate, today)
                            const isDisabled = isYearDisabled(year)

                            return (
                                <div
                                    key={year}
                                    className="relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent rounded-md"
                                    role="presentation"
                                >
                                    <button
                                        ref={(element) => {
                                            // eslint-disable-next-line security/detect-object-injection
                                            yearButtonRefs.current[index] = element
                                        }}
                                        name="year"
                                        className={cn(
                                            buttonVariants({ variant: "ghost" }),
                                            "inline-flex h-9 w-full items-center justify-center p-0 text-sm font-normal aria-selected:opacity-100",
                                            isSelected &&
                                                "bg-blue-500 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white",
                                            !isSelected && isCurrentYear && "bg-accent text-accent-foreground",
                                        )}
                                        disabled={isDisabled}
                                        role="gridcell"
                                        tabIndex={index === focusedIndex ? 0 : -1}
                                        type="button"
                                        aria-selected={isSelected}
                                        aria-label={
                                            isSelected
                                                ? `${year}, selected`
                                                : isCurrentYear
                                                  ? `${year}, current year`
                                                  : String(year)
                                        }
                                        onClick={() => onYearChange(yearDate)}
                                        onFocus={() => setFocusedIndex(index)}
                                        onKeyDown={(event) => handleYearKeyDown(event, index, year)}
                                    >
                                        <time dateTime={format(yearDate, "yyyy-MM-dd")}>{year}</time>
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

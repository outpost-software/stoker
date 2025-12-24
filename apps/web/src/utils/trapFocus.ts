export const trapFocus = (node: HTMLElement | null) => {
    if (!node) return

    const focusableSelectors = [
        "a[href]",
        "area[href]",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "button",
        "iframe",
        "object",
        "embed",
        '[tabindex]:not([tabindex="-1"])',
        "[contenteditable]",
    ]

    const getFocusableEls = () =>
        Array.from(node.querySelectorAll<HTMLElement>(focusableSelectors.join(","))).filter(
            (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1 && !el.getAttribute("aria-hidden"),
        )

    let focusableEls = getFocusableEls()
    if (focusableEls.length === 0) return
    let firstEl = focusableEls[0]
    let lastEl = focusableEls[focusableEls.length - 1]

    const ensureFocusInModal = () => {
        if (!node.contains(document.activeElement)) {
            firstEl.focus()
        }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
        focusableEls = getFocusableEls()
        firstEl = focusableEls[0]
        lastEl = focusableEls[focusableEls.length - 1]

        if (e.key === "Tab") {
            if (focusableEls.length === 0) return
            if (e.shiftKey) {
                if (document.activeElement === firstEl || !node.contains(document.activeElement)) {
                    e.preventDefault()
                    lastEl.focus()
                }
            } else {
                if (document.activeElement === lastEl || !node.contains(document.activeElement)) {
                    e.preventDefault()
                    firstEl.focus()
                }
            }
        }
    }

    document.addEventListener("keydown", handleKeyDown)

    setTimeout(() => {
        ensureFocusInModal()
    }, 0)

    return () => {
        document.removeEventListener("keydown", handleKeyDown)
    }
}

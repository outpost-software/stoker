import type { Page } from "@playwright/test"

export const locators = (page: Page) => ({
    login: {
        heading: page.getByRole("heading", { name: "Login", exact: true }),
        email: page.getByLabel("Email"),
        password: page.getByLabel("Password"),
        submit: page.getByRole("button", { name: "Login", exact: true }),
        error: page.getByRole("heading", { name: "Invalid login details" }),
    },
    collection: {
        heading: page.getByRole("heading", { level: 1 }),
        table: page.locator("table.list-table"),
        rows: page.locator("table.list-table tbody tr"),
        empty: page.locator("table.list-table tbody td[colspan]"),
        listTab: page.getByRole("tab", { name: "List", exact: true }),
        addButton: (recordLabel: string) => page.getByRole("button", { name: `Add ${recordLabel}` }),
    },
    record: {
        heading: page.getByRole("heading", { level: 1 }),
    },
    app: {
        errorPage: page.getByText(/something went wrong|page not found/i),
    },
})

export type StokerLocators = ReturnType<typeof locators>

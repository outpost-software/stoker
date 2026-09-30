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
        table: page.getByTestId("list-table"),
        rows: page.getByTestId("list-row"),
        empty: page.getByTestId("list-empty"),
        listTab: page.getByRole("tab", { name: "List", exact: true }),
        showAll: page.getByRole("radio", { name: "Toggle all" }),
        addButton: page.getByTestId("add-record"),
        search: page.getByPlaceholder("Search...", { exact: true }).filter({ visible: true }),
        range: {
            label: page.getByTestId("range-label").filter({ visible: true }),
            previous: page.getByTestId("range-previous").filter({ visible: true }),
            next: page.getByTestId("range-next").filter({ visible: true }),
        },
    },
    record: {
        heading: page.getByRole("heading", { level: 1 }),
        form: page.getByTestId("record-form"),
        field: (name: string) => page.getByTestId(`field-${name}`),
        save: page.getByRole("button", { name: "Save", exact: true }),
        updated: page.getByText(/ updated( successfully)?\.$/),
    },
    app: {
        root: page.getByTestId("app"),
        search: page.getByRole("searchbox", { name: "Search all..." }),
        errorPage: page.getByText(/something went wrong|page not found/i),
    },
})

export type StokerLocators = ReturnType<typeof locators>

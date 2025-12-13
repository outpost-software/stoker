// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const xeroError = (error: any) => {
    if (typeof error === "string") {
        try {
            error = JSON.parse(error)
        } catch {
            // Do nothing
        }
    }

    const body = error?.response?.body || error?.body

    return new Error(
        "VALIDATION_ERROR: Xero returned an error: " +
            (body?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
                body?.Message ||
                body?.Detail ||
                "Please contact support or try again later."),
    )
}

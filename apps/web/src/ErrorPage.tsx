import { useRouteError } from "react-router"
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"
import { useEffect } from "react"
import * as Sentry from "@sentry/react"

export default function ErrorPage({ sentry }: { sentry?: boolean }) {
    const error = useRouteError()
    console.error(error)

    useEffect(() => {
        if (sentry) {
            Sentry.captureException(error)
        }
    }, [error])

    return (
        <div className="flex justify-center items-center h-[calc(100vh-128px)] p-5">
            <Card>
                <CardHeader>
                    <CardTitle>An error has occurred.</CardTitle>
                </CardHeader>
                <CardContent>Please refresh the page to try again.</CardContent>
            </Card>
        </div>
    )
}

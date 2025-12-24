import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"

export default function Maintenance() {
    return (
        <div className="flex justify-center items-center h-[calc(100vh-128px)] p-5">
            <Card>
                <CardHeader>
                    <CardTitle>Maintenance Mode</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>We are currently performing maintenance on the system. Please check back later.</p>
                </CardContent>
            </Card>
        </div>
    )
}

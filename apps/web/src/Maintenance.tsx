import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card"

export default function Maintenance() {
    return (
        <div className="flex justify-center items-center h-screen p-5 bg-white">
            <Card className="relative bottom-8 bg-white text-black border-gray-200">
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

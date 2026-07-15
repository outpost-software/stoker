import { getSafeUrl } from "./isSafeUrl"

export const copyImageToClipboard = async (src: string) => {
    const safeSrc = getSafeUrl(src)
    if (!safeSrc) throw new Error("Invalid image URL")
    const pngBlob = (async () => {
        const response = await fetch(safeSrc)
        if (!response.ok) throw new Error("Failed to fetch image")
        const blob = await response.blob()
        if (blob.type === "image/png") return blob
        const bitmap = await createImageBitmap(blob)
        const canvas = document.createElement("canvas")
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Failed to get canvas context")
        context.drawImage(bitmap, 0, 0)
        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (result) => (result ? resolve(result) : reject(new Error("Failed to convert image"))),
                "image/png",
            )
        })
    })()
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })])
}

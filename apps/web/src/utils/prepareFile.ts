import type { FileOptions } from "@stoker-platform/types"

const DEFAULT_MAX_WIDTH = 1920
const DEFAULT_JPEG_QUALITY = 1

const replaceExtension = (filename: string, newExt: string): string => {
    const trimmed = filename.trim()
    const dot = trimmed.lastIndexOf(".")
    if (dot <= 0) {
        return `${trimmed}${newExt}`
    }
    return `${trimmed.slice(0, dot)}${newExt}`
}

const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.decoding = "async"
        img.onload = () => {
            URL.revokeObjectURL(url)
            resolve(img)
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error("Image decode failed"))
        }
        img.src = url
    })
}

export const prepareFile = async (
    file: File,
    preferredFileName: string,
    fileOptions: FileOptions,
): Promise<{ file: File; filename: string }> => {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
        return { file, filename: preferredFileName }
    }
    const usePngOutput = file.type === "image/png"

    let bitmap: ImageBitmap | undefined
    try {
        let width: number
        let height: number
        let img: HTMLImageElement | undefined

        try {
            bitmap = await createImageBitmap(file)
            width = bitmap.width
            height = bitmap.height
        } catch {
            img = await loadImageFromFile(file)
            width = img.naturalWidth
            height = img.naturalHeight
        }

        if (width < 1 || height < 1) {
            return { file, filename: preferredFileName }
        }

        const maxWidth =
            typeof fileOptions.maxImageWidth === "number" && fileOptions.maxImageWidth > 0
                ? Math.floor(fileOptions.maxImageWidth)
                : DEFAULT_MAX_WIDTH

        let targetW = width
        let targetH = height
        if (width > maxWidth || height > maxWidth) {
            if (width >= height) {
                targetW = maxWidth
                targetH = Math.max(1, Math.round((height / width) * maxWidth))
            } else {
                targetH = maxWidth
                targetW = Math.max(1, Math.round((width / height) * maxWidth))
            }
        }
        const didDownscale = targetW < width || targetH < height

        const canvas = document.createElement("canvas")
        canvas.width = targetW
        canvas.height = targetH
        const ctx = canvas.getContext("2d")
        if (!ctx) {
            return { file, filename: preferredFileName }
        }

        if (bitmap) {
            ctx.drawImage(bitmap, 0, 0, targetW, targetH)
        } else if (img) {
            ctx.drawImage(img, 0, 0, targetW, targetH)
        }

        const blob = await new Promise<Blob | null>((resolve) => {
            if (usePngOutput) {
                canvas.toBlob((b) => resolve(b), "image/png")
            } else {
                canvas.toBlob((b) => resolve(b), "image/jpeg", DEFAULT_JPEG_QUALITY)
            }
        })

        if (!blob) {
            return { file, filename: preferredFileName }
        }

        const noBenefit =
            blob.size >= file.size &&
            !didDownscale &&
            ((usePngOutput && file.type === "image/png") || (!usePngOutput && file.type === "image/jpeg"))
        if (noBenefit) {
            return { file, filename: preferredFileName }
        }

        const outMime = usePngOutput ? "image/png" : "image/jpeg"
        const ext = usePngOutput ? ".png" : ".jpg"
        const nextFilename = replaceExtension(preferredFileName, ext)
        const outFile = new File([blob], nextFilename, {
            type: outMime,
            lastModified: Date.now(),
        })

        return { file: outFile, filename: nextFilename }
    } catch {
        return { file, filename: preferredFileName }
    } finally {
        if (bitmap) {
            bitmap.close()
        }
    }
}

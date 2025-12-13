import {validateStorageName} from "@stoker-platform/utils";

export const validateStoragePath = (path: string): string | null => {
    if (!path) return null;

    if (typeof path !== "string") {
        return "Path must be a string";
    }

    if (path.includes("..")) {
        return "Path cannot contain ..";
    }

    if (path.startsWith("/") || path.startsWith("\\")) {
        return "Path cannot be absolute";
    }

    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) {
        return "Path cannot contain URL schemes";
    }

    const segments = path.split("/").filter((segment) => segment.length > 0);

    for (const segment of segments) {
        const validationError = validateStorageName(segment);
        if (validationError) {
            return `Invalid path segment "${segment}": ${validationError}`;
        }
    }

    return null;
};


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isDeleteSentinel = (value: any) => {
    return value && (value._methodName === "deleteField" || value.constructor.name === "DeleteTransform")
}

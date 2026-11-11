import {
    CollectionCustomization,
    Hook as hookType,
    HookArgs,
    Hooks,
    PreOperationHookArgs,
    PreWriteHookArgs,
    PostWriteHookArgs,
    PostOperationHookArgs,
    PreDuplicateHookArgs,
    PostWriteErrorHookArgs,
    PreReadHookArgs,
    PostReadHookArgs,
    GlobalConfig,
    PreFileAddHookArgs,
    PreFileUpdateHookArgs,
    PostFileAddErrorHookArgs,
    PostFileAddHookArgs,
    PostFileUpdateHookArgs,
    SetEmbeddingHookArgs,
    PreValidateHookArgs,
} from "@stoker-platform/types"

const isThenable = (value: unknown): value is Promise<unknown> =>
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"

const hook = async (name: string, callback?: hookType, args?: HookArgs, onAsync?: () => void): Promise<unknown> => {
    if (!callback) return
    let value = (callback as (hookArgs?: HookArgs) => unknown)(args)
    if (isThenable(value)) {
        onAsync?.()
        value = await value
    }
    if (value === false) throw new Error(`CANCELLED: Operation cancelled by ${name}`)
    return value
}

export function runHooks(
    hookName: "preOperation",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreOperationHookArgs,
): Promise<void>
export function runHooks(
    hookName: "preRead",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreReadHookArgs,
): Promise<void>
export function runHooks(
    hookName: "postRead",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PostReadHookArgs,
): Promise<void>
export function runHooks(
    hookName: "preOperation",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreOperationHookArgs,
): Promise<void>
export function runHooks(
    hookName: "preDuplicate",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreDuplicateHookArgs,
): Promise<void>
export function runHooks(
    hookName: "preValidate",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreValidateHookArgs,
): Promise<void>
export function runHooks(
    hookName: "preWrite",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreWriteHookArgs,
    options?: { onAsync?: (pending: boolean) => void },
): Promise<void>
export function runHooks(
    hookName: "postWrite",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PostWriteHookArgs,
): Promise<void>
export function runHooks(
    hookName: "postWriteError",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PostWriteErrorHookArgs,
): Promise<{ resolved: boolean; retry?: boolean } | void>
export function runHooks(
    hookName: "postOperation",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PostOperationHookArgs,
): Promise<void>
export function runHooks(
    hookName: "preFileAdd",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreFileAddHookArgs,
): Promise<void>
export function runHooks(
    hookName: "preFileUpdate",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreFileUpdateHookArgs,
): Promise<void>
export function runHooks(
    hookName: "postFileAdd",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PostFileAddHookArgs,
): Promise<void>
export function runHooks(
    hookName: "postFileAddError",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PostFileAddErrorHookArgs,
): Promise<void>
export function runHooks(
    hookName: "postFileUpdate",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PostFileUpdateHookArgs,
): Promise<void>
export function runHooks(
    hookName: "setEmbedding",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: SetEmbeddingHookArgs,
): Promise<string>

export async function runHooks(
    hookName: string,
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: HookArgs,
    options?: { onAsync?: (pending: boolean) => void },
): Promise<void | string | { resolved: boolean; retry?: boolean }> {
    let isAsync = false
    const onAsync = () => {
        if (isAsync) return
        isAsync = true
        options?.onAsync?.(true)
    }
    try {
        const value = await hook(hookName, customization.custom?.[hookName as keyof Hooks], args, onAsync)
        for (const field of customization.fields) {
            await hook(hookName, field.custom?.[hookName as keyof Hooks], args, onAsync)
        }
        if (hookName !== "setEmbedding") {
            await hook(hookName, globalConfig?.[hookName as keyof Omit<Hooks, "setEmbedding">], args, onAsync)
            if (hookName === "postWriteError") return value as { resolved: boolean; retry?: boolean } | void
        }
    } finally {
        if (isAsync) options?.onAsync?.(false)
    }
}

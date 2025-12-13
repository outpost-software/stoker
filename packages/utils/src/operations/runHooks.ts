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
    PostFileAddHookArgs,
    PostFileUpdateHookArgs,
    SetEmbeddingHookArgs,
} from "@stoker-platform/types"
import { tryPromise } from "../getConfigValue.js"

const hook = async (name: string, callback?: hookType, args?: HookArgs) => {
    if (callback) {
        const value = await tryPromise(callback, args)
        if (value === false) throw new Error(`CANCELLED: Operation cancelled by ${name}`)
        return value
    }
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
    hookName: "preWrite",
    globalConfig: GlobalConfig,
    customization: CollectionCustomization,
    args?: PreWriteHookArgs,
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
): Promise<void | string | { resolved: boolean; retry?: boolean }> {
    const value = await hook(hookName, customization.custom?.[hookName as keyof Hooks], args)
    for (const field of customization.fields) {
        await hook(hookName, field.custom?.[hookName as keyof Hooks], args)
    }
    if (hookName !== "setEmbedding") {
        await hook(hookName, globalConfig?.[hookName as keyof Omit<Hooks, "setEmbedding">], args)
        if (hookName === "postWriteError") return value
    }
}

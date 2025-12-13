import {
    CollectionCustomization,
    CollectionSchema,
    PostWriteErrorHookArgs,
    StokerPermissions,
    StokerRecord,
} from "@stoker-platform/types"
import { WriteBatch } from "firebase/firestore"
import { uniqueValidation } from "./uniqueValidation"
import { getCachedConfigValue, tryPromise, runHooks } from "@stoker-platform/utils"
import { writeLog } from "./writeLog"
import cloneDeep from "lodash/cloneDeep.js"
import { getGlobalConfigModule, getSchema } from "../initializeStoker"
import { addRecord } from "./addRecord"
import { updateRecord } from "./updateRecord"

export const saveRecord = async (
    operation: "create" | "update" | "delete",
    path: string[],
    docId: string,
    record: StokerRecord,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
    collectionSchema: CollectionSchema,
    customization: CollectionCustomization,
    batch: WriteBatch,
    userId: string,
    enableWriteLog: boolean,
    permissions: StokerPermissions,
    retry?: boolean,
    originalRecord?: StokerRecord,
) => {
    const schema = getSchema()
    const globalConfig = getGlobalConfigModule()
    const { labels } = collectionSchema

    let retries = 0

    const attempt = async () => {
        try {
            const batchCopy = cloneDeep(batch)
            await batchCopy.commit()
            return
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (mainError: any) {
            let uniqueErrors
            const autoCorrectUnique = await getCachedConfigValue(customization, [
                "collections",
                labels.collection,
                "custom",
                "autoCorrectUnique",
            ])

            if (mainError.code === "unavailable") {
                await tryPromise(globalConfig.onIndexedDBConnectionLost)
            }

            if (operation !== "delete" && mainError.code === "permission-denied") {
                try {
                    await uniqueValidation(operation, docId, record, collectionSchema, permissions)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (uniqueValidationError: any) {
                    const uniqueValidationFailures = uniqueValidationError.message.split(", ")
                    const numberErrors = []
                    const stringErrors = []
                    let retryOperation = false
                    for (const uniqueFailure of uniqueValidationFailures) {
                        const uniqueField = uniqueFailure.split(" ")[0]
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        const fieldSchema = schema.collections[labels.collection].fields.find(
                            (field) => field.name === uniqueField,
                        )!
                        if (!fieldSchema)
                            throw new Error(
                                `SCHEMA_ERROR: Field ${uniqueField} not found in ${labels.collection} schema`,
                            )
                        if (fieldSchema.type === "Number") numberErrors.push(uniqueFailure)
                        if (fieldSchema.type === "String") stringErrors.push(uniqueFailure)
                    }
                    if (!autoCorrectUnique || numberErrors.length > 0)
                        uniqueErrors = new Error(`VALIDATION_ERROR: ${uniqueValidationFailures.join(", ")}`)

                    if (autoCorrectUnique && stringErrors.length > 0) {
                        for (const uniqueFailure of stringErrors) {
                            const uniqueField = uniqueFailure.split(" ")[0]
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            const fieldSchema = schema.collections[labels.collection].fields.find(
                                (field) => field.name === uniqueField,
                            )!
                            if (fieldSchema.type === "Number") continue
                            let numberOfRetries = 1
                            // eslint-disable-next-line security/detect-object-injection
                            if (record[uniqueField].match(/ - DUPLICATE-\d+/)) {
                                numberOfRetries = parseInt(
                                    // eslint-disable-next-line security/detect-object-injection
                                    record[uniqueField].match(/ - DUPLICATE-\d+/)[0].split("-")[2],
                                )
                                // eslint-disable-next-line security/detect-object-injection
                                record[uniqueField] =
                                    // eslint-disable-next-line security/detect-object-injection
                                    record[uniqueField].replace(/ - DUPLICATE-\d+/g, "") +
                                    ` - DUPLICATE-${numberOfRetries + 1}`
                            } else {
                                // eslint-disable-next-line security/detect-object-injection
                                record[uniqueField] = record[uniqueField] + " - DUPLICATE-1"
                            }
                            if (!(numberOfRetries < 10)) {
                                uniqueErrors = new Error(
                                    uniqueValidationFailures
                                        .map((validationError: string) =>
                                            validationError.replace(/ - DUPLICATE-\d+/g, ""),
                                        )
                                        .join(", "),
                                )
                            } else retryOperation = true
                        }
                        if (retryOperation) {
                            if (operation === "create")
                                await addRecord(path, record, undefined, { retry: { type: "unique", docId } })
                            if (operation === "update")
                                await updateRecord(path, docId, record, undefined, {
                                    retry: {
                                        type: "unique",
                                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                        originalRecord: originalRecord!,
                                    },
                                })
                            return
                        }
                    }
                }
            }

            const error = uniqueErrors || mainError

            const postWriteErrorArgs: PostWriteErrorHookArgs = [
                operation,
                record,
                docId,
                context,
                error,
                retry,
                retries,
                operation === "update" ? originalRecord : undefined,
            ]

            const indexedDBConnectionLost = mainError.code === "unavailable"

            const errorHook = await runHooks("postWriteError", globalConfig, customization, postWriteErrorArgs)
            if (errorHook?.resolved) {
                return
            } else if (!indexedDBConnectionLost && errorHook?.retry) {
                retries++
                await attempt()
                return
            } else {
                if (enableWriteLog) {
                    writeLog(
                        operation,
                        "failed",
                        operation === "delete" ? record : record,
                        path,
                        docId,
                        collectionSchema,
                        userId,
                        error,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        operation === "update" ? originalRecord! : undefined,
                    )
                }
            }
            throw error
        }
    }
    await attempt()
    return
}

import { fetchCurrentSchema, getCollectionRefs, initializeStoker } from "@stoker-platform/node-client"
import { tryPromise, getRange } from "@stoker-platform/utils"
import { Filter, getFirestore, Query, WhereFilterOp } from "firebase-admin/firestore"
import { join } from "path"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const explainPreloadQueries = async (options: any) => {
    const { getGlobalConfigModule } = await initializeStoker(
        "production",
        options.tenant,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )

    const globalConfig = getGlobalConfigModule()
    const schema = await fetchCurrentSchema()

    const db = getFirestore()

    const permissionsSnapshot = await db
        .collection("tenants")
        .doc(options.tenant)
        .collection("system_user_permissions")
        .doc(options.id)
        .get()
    if (!permissionsSnapshot.exists) {
        throw new Error("User not found")
    }

    const permissions = permissionsSnapshot.data()

    const timezone = await tryPromise(globalConfig.timezone)

    const preloadConfigSync = await tryPromise(globalConfig.preload?.sync)
    const preloadConfig = await tryPromise(globalConfig.preload?.async)

    const preloadCollections = []

    if (preloadConfigSync) preloadCollections.push(...preloadConfigSync)
    if (preloadConfig) preloadCollections.push(...preloadConfig)

    if (!preloadCollections.length) process.exit()

    for (const collection of preloadCollections) {
        // eslint-disable-next-line security/detect-object-injection
        const collectionSchema = schema.collections[collection]
        const { preloadCache } = collectionSchema
        if (!preloadCache?.roles.includes(permissions?.Role)) continue
        const rangeConstraints = preloadCache?.range
        const constraints = (await tryPromise(collectionSchema.custom?.preloadCacheConstraints)) as [
            string,
            WhereFilterOp,
            unknown,
        ][]
        const orQueries = (await tryPromise(collectionSchema.custom?.preloadCacheOrQueries)) as [
            string,
            WhereFilterOp,
            unknown,
        ][]

        const queries = getCollectionRefs(options.tenant, [collection], schema, options.id, permissions).map(
            (ref: Query) => {
                const disjunctions: Filter[] = []
                if (rangeConstraints) {
                    const { start, end } = getRange(rangeConstraints, timezone)
                    const rangeQueries = rangeConstraints.fields.map((field) => {
                        return Filter.and(Filter.where(field, ">=", start), Filter.where(field, "<=", end))
                    })
                    disjunctions.push(Filter.and(Filter.or(...rangeQueries)))
                }
                if (orQueries) {
                    disjunctions.push(
                        Filter.and(Filter.or(...orQueries.map((constraint) => Filter.where(...constraint)))),
                    )
                }
                if (constraints) {
                    disjunctions.push(Filter.and(...constraints.map((constraint) => Filter.where(...constraint))))
                }
                return ref.where(Filter.and(...disjunctions))
            },
        )

        console.log(`${collection}:`)
        for (const query of queries) {
            const metrics = await query.explain({ analyze: options.analyze })
            console.log(JSON.stringify(metrics.metrics))
        }
        console.log("\n")
    }

    process.exit()
}

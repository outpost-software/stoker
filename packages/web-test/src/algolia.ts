import { Algoliasearch, algoliasearch } from "algoliasearch"
import type { StokerProject } from "./project.js"
import { emulatorFirestore } from "./emulator.js"

const indexNames = async (client: Algoliasearch): Promise<string[]> => {
    const names: string[] = []
    let page = 0
    for (;;) {
        const response = await client.listIndices({ page, hitsPerPage: 100 })
        names.push(...response.items.map((item) => item.name))
        page += 1
        if (page >= (response.nbPages ?? 1)) return names
    }
}

export const clearTenantAlgolia = async (project: StokerProject): Promise<void> => {
    const appId = process.env.ALGOLIA_ID
    if (!appId || !process.env.ALGOLIA_ADMIN_KEY) return

    const tenant = await emulatorFirestore(project)
    const client = algoliasearch(appId, process.env.ALGOLIA_ADMIN_KEY)
    const filter = `tenant_id:${tenant.id}`

    for (const indexName of await indexNames(client)) {
        const { taskID } = await client.deleteBy({ indexName, deleteByParams: { filters: filter } })
        await client.waitForTask({ indexName, taskID })
    }
}

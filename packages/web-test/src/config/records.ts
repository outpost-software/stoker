import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { CollectionSchema } from "@stoker-platform/types"
import type { DocumentSnapshot } from "firebase-admin/firestore"
import type { StokerProject } from "./project.js"
import { getStokerFirestore } from "@stoker-platform/node-client"
import { getTenant } from "../initializeStoker.js"

type CreatedRecords = Record<string, Record<string, string>>

const recordsFile = (rootDir: string) => join(rootDir, "playwright", ".records.json")

export const clearRecords = (rootDir: string): void => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    rmSync(recordsFile(rootDir), { force: true })
}

const getRecords = (project: StokerProject): CreatedRecords => {
    const path = recordsFile(project.rootDir)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as CreatedRecords) : {}
}

export const documentIds = async (collection: CollectionSchema): Promise<Set<string>> => {
    const db = getStokerFirestore()
    const tenantId = getTenant()
    const snapshot = await db.collection("tenants").doc(tenantId).collection(collection.labels.collection).get()
    return new Set(snapshot.docs.map((doc) => doc.id))
}

export const rememberRecord = async (
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
    before: Set<string>,
): Promise<void> => {
    const after = await documentIds(collection)
    const created = [...after].filter((id) => !before.has(id))
    if (created.length !== 1) {
        throw new Error(`${collection.labels.collection} created ${created.length} records; expected 1.`)
    }
    const path = recordsFile(project.rootDir)
    const records = getRecords(project)
    records[collection.labels.collection] = { ...records[collection.labels.collection], [role]: created[0] }
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    mkdirSync(dirname(path), { recursive: true })
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`)
}

export const fixtureRecordId = (project: StokerProject, collection: CollectionSchema, role: string): string => {
    const records = getRecords(project)
    const ids = records[collection.labels.collection] ?? {}
    // eslint-disable-next-line security/detect-object-injection
    const id = ids[role] ?? Object.values(ids)[0]
    if (!id) throw new Error(`${collection.labels.collection} has no record created.`)
    return id
}

export const fixtureRecord = async (
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
): Promise<DocumentSnapshot> => {
    const id = fixtureRecordId(project, collection, role)
    const db = getStokerFirestore()
    const tenantId = getTenant()
    const snapshot = await db.collection("tenants").doc(tenantId).collection(collection.labels.collection).doc(id).get()
    if (!snapshot.exists) throw new Error(`${collection.labels.collection} record ${id} was not found.`)
    return snapshot
}

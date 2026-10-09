import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { CollectionSchema, CollectionsSchema, StokerRecord } from "@stoker-platform/types"
import type { DocumentSnapshot } from "firebase-admin/firestore"
import { documentAccess } from "@stoker-platform/utils"
import type { StokerProject } from "./project.js"
import { getStokerFirestore } from "@stoker-platform/node-client"
import { getCurrentUser, getCurrentUserPermissions, getTenant } from "../initializeStoker.js"
import { loadSchema, updatesDisabled } from "./schema.js"
import { fixtureCollections, type ConformanceOptions } from "./options.js"

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

export const tenantCollection = (collection: CollectionSchema) => {
    const db = getStokerFirestore()
    const tenantId = getTenant()
    return db.collection("tenants").doc(tenantId).collection(collection.labels.collection)
}

export const documentIds = async (collection: CollectionSchema): Promise<Set<string>> => {
    const snapshot = await tenantCollection(collection).get()
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

const readableFixture = async (
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
): Promise<DocumentSnapshot | undefined> => {
    const ids = getRecords(project)[collection.labels.collection] ?? {}
    // eslint-disable-next-line security/detect-object-injection
    const candidates = [...new Set([ids[role], ...Object.values(ids)])].filter((id) => !!id)
    if (candidates.length === 0) return
    const schema = loadSchema(project)
    const user = await getCurrentUser(role)
    const permissions = await getCurrentUserPermissions(role)
    for (const id of candidates) {
        const snapshot = await tenantCollection(collection).doc(id).get()
        const record = { ...(snapshot.data() as StokerRecord), id }
        if (snapshot.exists && documentAccess("Read", collection, schema, user.uid, permissions, record)) {
            return snapshot
        }
    }
    return undefined
}

export const readableFixtures = async (
    schema: CollectionsSchema,
    role: string,
    project: StokerProject,
    options: ConformanceOptions,
): Promise<CollectionSchema[]> => {
    const collections: CollectionSchema[] = []
    for (const collection of fixtureCollections(schema, role, project, options)) {
        if (await readableFixture(project, collection, role)) collections.push(collection)
    }
    return collections
}

export const fixtureRecord = async (
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
): Promise<DocumentSnapshot> => {
    const snapshot = await readableFixture(project, collection, role)
    if (!snapshot) throw new Error(`${collection.labels.collection} has no record ${role} can open.`)
    return snapshot
}

export const fixtureRecordId = async (project: StokerProject, collection: CollectionSchema, role: string) =>
    (await fixtureRecord(project, collection, role)).id

export const fixtureUpdatesDisabled = async (
    schema: CollectionsSchema,
    project: StokerProject,
    collection: CollectionSchema,
    role: string,
): Promise<boolean> => {
    const snapshot = await fixtureRecord(project, collection, role)
    return updatesDisabled(schema, collection, snapshot.data() as StokerRecord)
}

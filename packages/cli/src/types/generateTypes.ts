import { writeFile } from "fs/promises"
import { join } from "path"
import type { CollectionField, CollectionSchema, CollectionsSchema } from "@stoker-platform/types"
import { isRelationField } from "@stoker-platform/utils"
import { generateSchema } from "../deploy/schema/generateSchema.js"

const INDENT = "    "

const tsLiteral = (value: string | number) => JSON.stringify(value)

const literalUnion = (values: ReadonlyArray<string | number>) => values.map(tsLiteral).join(" | ")

const fieldType = (field: CollectionField, mode: "record" | "input"): string => {
    switch (field.type) {
        case "String":
            return field.values?.length ? literalUnion(field.values) : "string"
        case "Boolean":
            return "boolean"
        case "Number":
            if (field.values?.length) return literalUnion(field.values)
            if (field.autoIncrement) {
                return mode === "record" ? `number | ${tsLiteral("Pending")}` : "number"
            }
            return "number"
        case "Timestamp":
            return "FirebaseTimestamp"
        case "Array":
            return field.values?.length ? `(${literalUnion(field.values)})[]` : "unknown[]"
        case "Map":
            return "Record<string, unknown>"
        case "Embedding":
            return "unknown"
        case "Computed":
            return mode === "record" ? "string | number" : "never"
        default:
            return "unknown"
    }
}

const buildField = (field: CollectionField, mode: "record" | "input"): string[] => {
    if (field.type === "Embedding") return []
    if (field.type === "Computed" && mode === "input") return []

    if (isRelationField(field)) {
        const required = Boolean(field.required)
        const optional = required ? "" : "?"
        if (mode === "input") {
            return [`${INDENT}${tsLiteral(field.name)}${optional}: StokerRelationObject`]
        }
        return [
            `${INDENT}${tsLiteral(field.name)}${optional}: StokerRelationObject`,
            `${INDENT}${tsLiteral(`${field.name}_Array`)}${optional}: StokerRelationArray`,
        ]
    }

    const isAutoIncrement = field.type === "Number" && field.autoIncrement
    const required = Boolean(field.required) && !(mode === "input" && isAutoIncrement)
    const optional = required ? "" : "?"
    const nullable = "nullable" in field && field.nullable ? " | null" : ""
    return [`${INDENT}${tsLiteral(field.name)}${optional}: ${fieldType(field, mode)}${nullable}`]
}

const buildRecordType = (collection: CollectionSchema): string => {
    const typeName = `${collection.labels.collection}Record`
    const lines = collection.fields.flatMap((field) => buildField(field, "record"))
    return [`export type ${typeName} = SystemFields & {`, ...lines, "}"].join("\n")
}

const buildCreateInputType = (collection: CollectionSchema): string => {
    const typeName = `${collection.labels.collection}CreateInput`
    const lines = collection.fields.flatMap((field) => buildField(field, "input"))
    return [`export type ${typeName} = {`, ...lines, "}"].join("\n")
}

const buildUpdateInputType = (collection: CollectionSchema): string => {
    const typeName = collection.labels.collection
    return `export type ${typeName}UpdateInput = Partial<${typeName}CreateInput>`
}

const buildMap = (
    mapName: string,
    collections: CollectionSchema[],
    suffix: "Record" | "CreateInput" | "UpdateInput",
): string => {
    const entries = collections.map(
        (collection) => `${INDENT}${tsLiteral(collection.labels.collection)}: ${collection.labels.collection}${suffix}`,
    )
    return [`export type ${mapName} = {`, ...entries, "}"].join("\n")
}

const buildOutput = (collections: CollectionSchema[]): string => {
    const sections: string[] = [
        "import type {",
        `${INDENT}FirebaseTimestamp,`,
        `${INDENT}SystemFields,`,
        `${INDENT}StokerRelationArray,`,
        `${INDENT}StokerRelationObject,`,
        '} from "@stoker-platform/types"',
        "",
        [
            "export type CollectionName =",
            ...collections.map((collection) => `${INDENT}| ${tsLiteral(collection.labels.collection)}`),
        ].join("\n"),
        "",
    ]

    for (const collection of collections) {
        sections.push(
            buildRecordType(collection),
            "",
            buildCreateInputType(collection),
            "",
            buildUpdateInputType(collection),
            "",
        )
    }

    sections.push(
        buildMap("CollectionRecordMap", collections, "Record"),
        "",
        buildMap("CollectionCreateInputMap", collections, "CreateInput"),
        "",
        buildMap("CollectionUpdateInputMap", collections, "UpdateInput"),
        "",
        "export type CollectionRecord<C extends CollectionName> = CollectionRecordMap[C]",
        "export type CollectionCreateInput<C extends CollectionName> = CollectionCreateInputMap[C]",
        "export type CollectionUpdateInput<C extends CollectionName> = CollectionUpdateInputMap[C]",
        "",
    )

    return sections.join("\n")
}

export const generateTypes = async () => {
    const schema: CollectionsSchema = await generateSchema(true)
    const collections = Object.values(schema.collections).sort((a, b) =>
        a.labels.collection.localeCompare(b.labels.collection),
    )

    const outPath = join(process.cwd(), "src", "types.ts")
    await writeFile(outPath, buildOutput(collections), "utf8")

    if (collections.length === 1) {
        console.log("Generated types for 1 collection")
    } else {
        console.log(`Generated types for ${collections.length} collections`)
    }
}

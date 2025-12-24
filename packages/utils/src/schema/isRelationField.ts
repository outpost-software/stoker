import { CollectionField, RelationField } from "@stoker-platform/types"

export const isRelationField = (field: CollectionField): field is RelationField => {
    return ["OneToOne", "OneToMany", "ManyToOne", "ManyToMany"].includes(field.type)
}

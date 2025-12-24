import { CollectionField, CollectionCustomization } from "@stoker-platform/types"

export const getFieldCustomization = (field: CollectionField, customizationFile: CollectionCustomization) => {
    return customizationFile.fields.filter((customField) => customField.name === field.name)[0]
}

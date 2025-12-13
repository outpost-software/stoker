import { StokerRecord } from "@stoker-platform/types"

export const populateContact = (company: StokerRecord) => {
    const address = company.Address || ""
    const email = company.Email || ""
    const phone = company.Phone || ""
    const abn = company.ABN ? company.ABN.toString() : ""
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contact: Record<string, any> = {
        name: company.Name,
        addresses: {
            address: {
                addressType: "POBOX",
                addressLine1: address,
            },
        },
        emailAddress: email,
        phones: {
            phone: {
                phoneType: "DEFAULT",
                phoneNumber: phone,
            },
        },
        taxNumber: abn,
    }
    if (company.Xero_ID) {
        contact.contactID = company.Xero_ID
    }
    return contact
}

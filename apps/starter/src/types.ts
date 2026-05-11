import type {
    FirestoreTimestamp,
    SystemFields,
    StokerRelationArray,
    StokerRelationObject,
} from "@stoker-platform/types"

export type CollectionName =
    | "Buildings"
    | "Companies"
    | "Contacts"
    | "Inbox"
    | "Invoices"
    | "Outbox"
    | "Services"
    | "Settings"
    | "Sites"
    | "Users"
    | "Vehicles"
    | "Work_Orders"

export type BuildingsRecord = SystemFields & {
    Name: string
    Description: string
}

export type BuildingsCreateInput = {
    Name: string
    Description: string
}

export type BuildingsUpdateInput = Partial<BuildingsCreateInput>

export type CompaniesRecord = SystemFields & {
    Name: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Address?: string
    Number: number | "Pending"
    Active?: boolean
    ABN?: string
    Revenue?: number
    Established?: FirestoreTimestamp
    Contacts?: StokerRelationObject
    Contacts_Array?: StokerRelationArray
    Sites?: StokerRelationObject
    Sites_Array?: StokerRelationArray
    Work_Orders?: StokerRelationObject
    Work_Orders_Array?: StokerRelationArray
    Start: FirestoreTimestamp
    Coordinates?: string | number
    Location?: unknown[] | null
}

export type CompaniesCreateInput = {
    Name: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Address?: string
    Number?: number
    Active?: boolean
    ABN?: string
    Revenue?: number
    Established?: FirestoreTimestamp
    Contacts?: StokerRelationObject
    Sites?: StokerRelationObject
    Work_Orders?: StokerRelationObject
    Start: FirestoreTimestamp
    Location?: unknown[] | null
}

export type CompaniesUpdateInput = Partial<CompaniesCreateInput>

export type ContactsRecord = SystemFields & {
    Name: string
    User_ID?: string
    Enabled: boolean
    Role: "Client"
    Email: string
    Company: StokerRelationObject
    Company_Array: StokerRelationArray
    Establishment?: StokerRelationObject
    Establishment_Array?: StokerRelationArray
    Work_Orders?: StokerRelationObject
    Work_Orders_Array?: StokerRelationArray
    State: string
    User?: StokerRelationObject
    User_Array?: StokerRelationArray
    Sites?: StokerRelationObject
    Sites_Array?: StokerRelationArray
}

export type ContactsCreateInput = {
    Name: string
    User_ID?: string
    Enabled: boolean
    Role: "Client"
    Email: string
    Company: StokerRelationObject
    Establishment?: StokerRelationObject
    Work_Orders?: StokerRelationObject
    State: string
    User?: StokerRelationObject
    Sites?: StokerRelationObject
}

export type ContactsUpdateInput = Partial<ContactsCreateInput>

export type InboxRecord = SystemFields & {
    Received?: string | number
    Sender: StokerRelationObject
    Sender_Array: StokerRelationArray
    Recipient: StokerRelationObject
    Recipient_Array: StokerRelationArray
    Recipients: StokerRelationObject
    Recipients_Array: StokerRelationArray
    Subject: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Status: "Unread" | "Read" | "Archived"
    Message: Record<string, unknown>
    Work_Order?: StokerRelationObject
    Work_Order_Array?: StokerRelationArray
    Outbox_Message?: string
}

export type InboxCreateInput = {
    Sender: StokerRelationObject
    Recipient: StokerRelationObject
    Recipients: StokerRelationObject
    Subject: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Status: "Unread" | "Read" | "Archived"
    Message: Record<string, unknown>
    Work_Order?: StokerRelationObject
    Outbox_Message?: string
}

export type InboxUpdateInput = Partial<InboxCreateInput>

export type InvoicesRecord = SystemFields & {
    Number: number | "Pending"
    Ref: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Company: StokerRelationObject
    Company_Array: StokerRelationArray
    Site: StokerRelationObject
    Site_Array: StokerRelationArray
    Status: "Draft" | "Sent" | "Paid" | "Archived"
    Issued_Date: FirestoreTimestamp | null
    Due_Date: FirestoreTimestamp
    Message?: string
    To?: StokerRelationObject
    To_Array?: StokerRelationArray
    CC?: StokerRelationObject
    CC_Array?: StokerRelationArray
    Billing_Heading?: string
    Billing_Att?: string
    Billing_Address?: string
    Billing_Site?: string
    Billing_Sections?: unknown[]
    Billing_Line_Items?: unknown[]
    Billing_Show_Totals?: boolean
    Billing_Footnotes?: string
}

export type InvoicesCreateInput = {
    Number?: number
    Ref: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Company: StokerRelationObject
    Site: StokerRelationObject
    Status: "Draft" | "Sent" | "Paid" | "Archived"
    Issued_Date: FirestoreTimestamp | null
    Due_Date: FirestoreTimestamp
    Message?: string
    To?: StokerRelationObject
    CC?: StokerRelationObject
    Billing_Heading?: string
    Billing_Att?: string
    Billing_Address?: string
    Billing_Site?: string
    Billing_Sections?: unknown[]
    Billing_Line_Items?: unknown[]
    Billing_Show_Totals?: boolean
    Billing_Footnotes?: string
}

export type InvoicesUpdateInput = Partial<InvoicesCreateInput>

export type OutboxRecord = SystemFields & {
    Sent?: string | number
    Recipients: StokerRelationObject
    Recipients_Array: StokerRelationArray
    Subject: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Status: "Sending" | "Success" | "Failed"
    Message: Record<string, unknown>
    Work_Order?: StokerRelationObject
    Work_Order_Array?: StokerRelationArray
}

export type OutboxCreateInput = {
    Recipients: StokerRelationObject
    Subject: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Status: "Sending" | "Success" | "Failed"
    Message: Record<string, unknown>
    Work_Order?: StokerRelationObject
}

export type OutboxUpdateInput = Partial<OutboxCreateInput>

export type ServicesRecord = SystemFields & {
    Name: string
    Description?: string
    Contact?: StokerRelationObject
    Contact_Array?: StokerRelationArray
    Vehicle?: StokerRelationObject
    Vehicle_Array?: StokerRelationArray
    Kilometers?: number
}

export type ServicesCreateInput = {
    Name: string
    Description?: string
    Contact?: StokerRelationObject
    Vehicle?: StokerRelationObject
    Kilometers?: number
}

export type ServicesUpdateInput = Partial<ServicesCreateInput>

export type SettingsRecord = SystemFields & {
    Company_Name: string
    Company_Logo?: string
}

export type SettingsCreateInput = {
    Company_Name: string
    Company_Logo?: string
}

export type SettingsUpdateInput = Partial<SettingsCreateInput>

export type SitesRecord = SystemFields & {
    Name: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Company: StokerRelationObject
    Company_Array: StokerRelationArray
    Contacts?: StokerRelationObject
    Contacts_Array?: StokerRelationArray
    State: "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "NT" | "ACT"
    Active?: boolean
    Expire_At: FirestoreTimestamp
    Work_Orders?: StokerRelationObject
    Work_Orders_Array?: StokerRelationArray
    Start: FirestoreTimestamp | null
    User?: StokerRelationObject
    User_Array?: StokerRelationArray
    Location?: unknown[] | null
}

export type SitesCreateInput = {
    Name: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Company: StokerRelationObject
    Contacts?: StokerRelationObject
    State: "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "NT" | "ACT"
    Active?: boolean
    Expire_At: FirestoreTimestamp
    Work_Orders?: StokerRelationObject
    Start: FirestoreTimestamp | null
    User?: StokerRelationObject
    Location?: unknown[] | null
}

export type SitesUpdateInput = Partial<SitesCreateInput>

export type UsersRecord = SystemFields & {
    Name: string
    Enabled: boolean
    User_ID?: string
    Role: "Office" | "Area Manager" | "Subcontractor" | "Cleaner"
    Email: string
    Photo_URL?: string
    Address?: string
    ID?: string
    Profile_Avatar?: string
    IP_Address?: string
    Number: number | "Pending"
    Vehicles?: StokerRelationObject
    Vehicles_Array?: StokerRelationArray
    Contact?: StokerRelationObject
    Contact_Array?: StokerRelationArray
    Work_Orders?: StokerRelationObject
    Work_Orders_Array?: StokerRelationArray
    Users?: StokerRelationObject
    Users_Array?: StokerRelationArray
    Start: FirestoreTimestamp
    Coffee_Preference?: string
}

export type UsersCreateInput = {
    Name: string
    Enabled: boolean
    User_ID?: string
    Role: "Office" | "Area Manager" | "Subcontractor" | "Cleaner"
    Email: string
    Photo_URL?: string
    Address?: string
    ID?: string
    Profile_Avatar?: string
    IP_Address?: string
    Number?: number
    Vehicles?: StokerRelationObject
    Contact?: StokerRelationObject
    Work_Orders?: StokerRelationObject
    Users?: StokerRelationObject
    Start: FirestoreTimestamp
    Coffee_Preference?: string
}

export type UsersUpdateInput = Partial<UsersCreateInput>

export type VehiclesRecord = SystemFields & {
    Name: string
    Number: number | "Pending"
    Description?: string
    Contacts?: StokerRelationObject
    Contacts_Array?: StokerRelationArray
    Company?: StokerRelationObject
    Company_Array?: StokerRelationArray
    User?: StokerRelationObject
    User_Array?: StokerRelationArray
    Service?: StokerRelationObject
    Service_Array?: StokerRelationArray
}

export type VehiclesCreateInput = {
    Name: string
    Number?: number
    Description?: string
    Contacts?: StokerRelationObject
    Company?: StokerRelationObject
    User?: StokerRelationObject
    Service?: StokerRelationObject
}

export type VehiclesUpdateInput = Partial<VehiclesCreateInput>

export type Work_OrdersRecord = SystemFields & {
    Name: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Establishment: StokerRelationObject
    Establishment_Array: StokerRelationArray
    Users?: StokerRelationObject
    Users_Array?: StokerRelationArray
    User?: StokerRelationObject
    User_Array?: StokerRelationArray
    Site: StokerRelationObject
    Site_Array: StokerRelationArray
    Contact?: StokerRelationObject
    Contact_Array?: StokerRelationArray
    State: "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "NT" | "ACT"
    Status: "Not Started" | "In Progress" | "Completed"
    Start: FirestoreTimestamp | null
    End?: FirestoreTimestamp | null
    Price?: number
    Area?: 1 | 3 | 5
    Month: (
        | "January"
        | "February"
        | "March"
        | "April"
        | "May"
        | "June"
        | "July"
        | "August"
        | "September"
        | "October"
        | "November"
        | "December"
    )[]
    Signatures?: Record<string, unknown>
    Expire_At: FirestoreTimestamp
    Photo_URL?: string
    Coordinates?: string | number
    Description?: Record<string, unknown>
    Location?: unknown[] | null
}

export type Work_OrdersCreateInput = {
    Name: string
    Archived?: boolean
    Archived_At?: FirestoreTimestamp
    Establishment: StokerRelationObject
    Users?: StokerRelationObject
    User?: StokerRelationObject
    Site: StokerRelationObject
    Contact?: StokerRelationObject
    State: "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "NT" | "ACT"
    Status: "Not Started" | "In Progress" | "Completed"
    Start: FirestoreTimestamp | null
    End?: FirestoreTimestamp | null
    Price?: number
    Area?: 1 | 3 | 5
    Month: (
        | "January"
        | "February"
        | "March"
        | "April"
        | "May"
        | "June"
        | "July"
        | "August"
        | "September"
        | "October"
        | "November"
        | "December"
    )[]
    Signatures?: Record<string, unknown>
    Expire_At: FirestoreTimestamp
    Photo_URL?: string
    Description?: Record<string, unknown>
    Location?: unknown[] | null
}

export type Work_OrdersUpdateInput = Partial<Work_OrdersCreateInput>

export type CollectionRecordMap = {
    Buildings: BuildingsRecord
    Companies: CompaniesRecord
    Contacts: ContactsRecord
    Inbox: InboxRecord
    Invoices: InvoicesRecord
    Outbox: OutboxRecord
    Services: ServicesRecord
    Settings: SettingsRecord
    Sites: SitesRecord
    Users: UsersRecord
    Vehicles: VehiclesRecord
    Work_Orders: Work_OrdersRecord
}

export type CollectionCreateInputMap = {
    Buildings: BuildingsCreateInput
    Companies: CompaniesCreateInput
    Contacts: ContactsCreateInput
    Inbox: InboxCreateInput
    Invoices: InvoicesCreateInput
    Outbox: OutboxCreateInput
    Services: ServicesCreateInput
    Settings: SettingsCreateInput
    Sites: SitesCreateInput
    Users: UsersCreateInput
    Vehicles: VehiclesCreateInput
    Work_Orders: Work_OrdersCreateInput
}

export type CollectionUpdateInputMap = {
    Buildings: BuildingsUpdateInput
    Companies: CompaniesUpdateInput
    Contacts: ContactsUpdateInput
    Inbox: InboxUpdateInput
    Invoices: InvoicesUpdateInput
    Outbox: OutboxUpdateInput
    Services: ServicesUpdateInput
    Settings: SettingsUpdateInput
    Sites: SitesUpdateInput
    Users: UsersUpdateInput
    Vehicles: VehiclesUpdateInput
    Work_Orders: Work_OrdersUpdateInput
}

export type CollectionRecord<C extends CollectionName> = CollectionRecordMap[C]
export type CollectionCreateInput<C extends CollectionName> = CollectionCreateInputMap[C]
export type CollectionUpdateInput<C extends CollectionName> = CollectionUpdateInputMap[C]

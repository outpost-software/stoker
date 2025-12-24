import type { GenerateSchema, CollectionSchema, StokerRecord } from "@stoker-platform/types"
import { Users2 } from "lucide-react"

const Users: GenerateSchema = (sdk): CollectionSchema => {
    return {
        labels: {
            collection: "Users",
            record: "User",
        },
        auth: true,
        enableWriteLog: true,
        fullTextSearch: ["Name", "Email"],
        access: {
            auth: ["Office", "Area Manager"],
            operations: {
                read: ["Office", "Area Manager"],
                create: ["Office", "Area Manager"],
                update: ["Office", "Area Manager"],
                delete: ["Office"],
            },
            permissionWriteRestrictions: [
                {
                    userRole: "Area Manager",
                    recordRole: "Area Manager",
                    collections: [
                        {
                            collection: "Work_Orders",
                            operations: ["Read", "Create", "Update"],
                            attributeRestrictions: ["Record_Owner", "Record_Property"],
                        },
                        {
                            collection: "Sites",
                            operations: ["Read", "Update"],
                            restrictEntities: true,
                        },
                        {
                            collection: "Contacts",
                            operations: ["Read"],
                            auth: true,
                        },
                        {
                            collection: "Inbox",
                            operations: ["Read", "Create", "Update"],
                            attributeRestrictions: ["Record_User"],
                        },
                        {
                            collection: "Outbox",
                            operations: ["Read", "Create", "Update"],
                            attributeRestrictions: ["Record_Owner"],
                        },
                        {
                            collection: "Users",
                            operations: ["Read", "Create", "Update"],
                        },
                    ],
                },
                {
                    userRole: "Subcontractor",
                    recordRole: "Cleaner",
                    collections: [
                        {
                            collection: "Sites",
                            operations: ["Read"],
                        },
                    ],
                },
            ],
        },
        recordTitleField: "Name",
        indexExemption: true,
        seedOrder: 1,
        custom: {
            async preWrite(operation, data) {
                let userId: string
                if (sdk === "web") {
                    const { getAuth } = await import("firebase/auth")
                    const auth = getAuth()
                    const user = auth.currentUser
                    if (!user) throw new Error("NOT_AUTHENTICATED")
                    userId = user?.uid
                    if (operation === "create") console.log(userId + " - " + data.Name)
                } else {
                    userId = "System"
                    if (operation === "create") console.log(userId + " - " + data.Name)
                }
            },
            autoCorrectUnique: true,
        },
        admin: {
            navbarPosition: 8,
            icon: Users2 as React.FC,
            statusField: {
                field: "Enabled",
                active: [true],
                archived: [false],
            },
            itemsPerPage: 40,
            defaultSort: {
                field: "Number",
                direction: "desc",
            },
            formUpload: true,
            formImages: true,
            metrics: [
                {
                    type: "sum",
                    field: "Number",
                    title: "Total Users",
                    roles: ["Office"],
                    prefix: "$",
                },
                {
                    type: "average",
                    field: "Number",
                    title: "Average Users",
                    roles: ["Office"],
                    suffix: "%",
                },
                {
                    type: "area",
                    dateField: "Start",
                    metricField1: "Number",
                    defaultRange: "90d",
                    title: "Users Over Time",
                },
            ],
            cards: {
                headerField: "ID",
                sections: [
                    {
                        title: "User Details",
                        fields: ["Name", "Role", "Email"],
                        maxSectionLines: 2,
                    },
                    {
                        title: "Contact Details",
                        fields: ["Address", "IP_Address"],
                        blocks: true,
                        maxSectionLines: 2,
                    },
                    {
                        title: "System Details",
                        fields: ["ID", "Number"],
                    },
                    {
                        large: true,
                        fields: ["IP_Address"],
                    },
                    {
                        title: "Avatar",
                        fields: ["Profile_Avatar", "Photo_URL"],
                        maxSectionLines: 2,
                    },
                ],
                footerField: "Last_Save_At",
            },
            images: {
                title: "Pics",
                imageField: "Photo_URL",
                size: "md",
                maxHeaderLines: 2,
            },
            map: {
                addressField: "Address",
                center: {
                    lat: -37.840935,
                    lng: 144.946457,
                },
                zoom: 9,
                noLocation: {
                    title: "No Address",
                },
            },
            calendar: {
                fullCalendarLarge: {
                    headerToolbar: {
                        start: "title",
                        center: "",
                        end: "today timeGridWeek,dayGridMonth,multiMonthYear,resourceTimelineWeek,resourceTimeGridDay prev,next",
                    },
                },
                startField: "Start",
                allDayField: "Enabled",
                resourceField: "Enabled",
                dataStart: { months: 6 },
                dataEnd: { months: 6 },
                dataStartOffset: { months: 3 },
                dataEndOffset: { months: 3 },
            },
            filters: [
                {
                    type: "select",
                    field: "Enabled",
                    title: () => "Enabled",
                    roles: ["Office"],
                },
                {
                    type: "select",
                    field: "Role",
                    title: "User Role",
                    style: "buttons",
                    condition(value) {
                        return value !== "Office"
                    },
                },
                {
                    type: "relation",
                    field: "Work_Orders",
                    constraints: [["Status", "in", ["Not Started", "In Progress"]]],
                },
            ],
            rowHighlight: [
                {
                    condition(record) {
                        return record.Role === "Area Manager"
                    },
                    className: "bg-destructive/20 hover:bg-destructive/50 dark:bg-blue-500/50 dark:hover:bg-blue-500",
                },
                {
                    condition(record) {
                        return record.Role === "Subcontractor"
                    },
                    className: "bg-yellow-100/50 hover:bg-yellow-100 dark:bg-blue-500/20 dark:hover:bg-blue-500/30",
                },
            ],
        },
        fields: [
            {
                name: "Name",
                type: "String",
                required: true,
                maxlength: 255,
                admin: {
                    live: true,
                },
            },
            {
                name: "Enabled",
                type: "Boolean",
                required: true,
                admin: {
                    hidden: "lg",
                    switch: true,
                },
            },
            {
                name: "User_ID",
                type: "String",
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                },
            },
            {
                name: "Role",
                type: "String",
                values: ["Office", "Area Manager", "Subcontractor", "Cleaner"],
                required: true,
                admin: {
                    badge(record?: StokerRecord) {
                        if (!record) return true
                        switch (record.Role) {
                            case "Office":
                                return "destructive"
                            case "Area Manager":
                                return "primary"
                            case "Subcontractor":
                                return "secondary"
                            default:
                                return true
                        }
                    },
                },
                sorting: true,
            },
            {
                name: "Email",
                type: "String",
                email: true,
                required: true,
                unique: true,
                admin: {
                    hidden: "sm",
                },
                sorting: {
                    direction: "asc",
                },
            },
            {
                name: "Photo_URL",
                type: "String",
                pattern: "^https://firebasestorage\\.googleapis\\.com/.*$",
                admin: {
                    image: true,
                    label: "Photo URL",
                    hidden: "xl",
                },
            },
            {
                name: "Address",
                type: "String",
                minlength: 10,
                custom: {
                    initialValue() {
                        return "123 Fake Street, Melbourne, VIC 3000"
                    },
                },
                admin: {
                    hidden: "xl",
                },
                sorting: true,
                access: ["Office"],
            },
            {
                name: "ID",
                type: "String",
                uuid: true,
                unique: true,
                admin: {
                    condition: {
                        list: false,
                    },
                    italic: true,
                },
            },
            {
                name: "Profile_Avatar",
                type: "String",
                emoji: true,
                admin: {
                    label: "Avatar",
                    hidden: "lg",
                },
            },
            {
                name: "IP_Address",
                type: "String",
                ip: true,
                restrictCreate: ["Office"],
                admin: {
                    label: "IP Address",
                    condition: {
                        list: false,
                    },
                },
            },
            {
                name: "Number",
                type: "Number",
                autoIncrement: true,
                admin: {
                    hidden: "lg",
                    column: 1,
                },
                sorting: {
                    direction: "desc",
                },
                required: true,
            },
            {
                name: "Vehicles",
                type: "ManyToOne",
                collection: "Vehicles",
                includeFields: ["Name"],
                access: ["Office"],
                admin: {
                    condition: {
                        list: false,
                    },
                },
            },
            {
                name: "Contact",
                type: "OneToOne",
                collection: "Contacts",
                includeFields: ["Name"],
                admin: {
                    condition: {
                        list: false,
                    },
                },
            },
            {
                name: "Work_Orders",
                type: "ManyToMany",
                collection: "Work_Orders",
                admin: {
                    condition: {
                        list: false,
                    },
                },
            },
            {
                name: "Users",
                type: "ManyToMany",
                collection: "Users",
                includeFields: ["Name"],
                admin: {
                    condition: {
                        list: false,
                    },
                },
            },
            {
                name: "Start",
                type: "Timestamp",
                required: true,
            },
        ],
    }
}

export default Users

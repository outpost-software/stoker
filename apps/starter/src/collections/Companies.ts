import type { CollectionSchema, GenerateSchema, StokerRecord } from "@stoker-platform/types"
import { Activity, BriefcaseBusinessIcon, Building2, MapPin } from "lucide-react"

const Companies: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Companies",
            record: "Company",
        },
        access: {
            customSecurityRules: false,
            operations: {
                assignable: true,
                read: ["Office", "Area Manager"],
                create: ["Office", "Area Manager"],
                update: ["Office", "Area Manager"],
                delete: ["Office"],
            },
        },
        recordTitleField: "Name",
        softDelete: {
            archivedField: "Archived",
            timestampField: "Archived_At",
            retentionPeriod: 7,
        },
        fullTextSearch: ["Name"],
        preloadCache: {
            roles: ["Area Manager"],
        },
        custom: {
            autoCorrectUnique: true,
        },
        enableWriteLog: true,
        relationLists: [
            {
                collection: "Contacts",
                field: "Company",
            },
            {
                collection: "Work_Orders",
                field: "Establishment",
            },
        ],
        seedOrder: 2,
        admin: {
            navbarPosition: 1,
            defaultRoute: "work_orders",
            duplicate: true,
            convert: [
                {
                    collection: "Contacts",
                    convert: (record: StokerRecord) => {
                        return {
                            Name: record.Name,
                        }
                    },
                    roles: ["Office", "Area Manager"],
                },
            ],
            icon: Building2 as React.FC,
            cards: {
                statusField: "Active",
                headerField: "ABN",
                sections: [
                    {
                        title: "Company Details",
                        fields: ["Name"],
                        maxSectionLines: 1,
                    },
                ],
            },
            map: {
                coordinatesField: "Location",
                center: {
                    lat: -37.8136,
                    lng: 144.9631,
                },
                zoom: 9,
                noLocation: {
                    title: "No Location",
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
                dataStart: { months: 6 },
                dataEnd: { months: 6 },
                dataStartOffset: { months: 3 },
                dataEndOffset: { months: 3 },
            },
            filters: [
                {
                    type: "select",
                    field: "Active",
                },
            ],
            formLists: [
                {
                    collection: "Contacts",
                    fields: ["Name", "Email"],
                },
                {
                    collection: "Work_Orders",
                    fields: ["Name", "Start", "Status"],
                    sortField: "Start",
                    sortDirection: "desc",
                },
            ],
            onChange: (operation: "create" | "update", record: StokerRecord) => {
                if (operation === "update" && !record.Address?.includes("Tester")) {
                    return {
                        Address: (record.Address || "") + "Tester",
                    }
                }
                return undefined
            },
        },
        indexExemption: true,
        fields: [
            {
                name: "Name",
                type: "String",
                required: true,
                maxlength: 255,
                restrictUpdate: true,
                admin: {
                    icon: {
                        component: Building2 as React.FC,
                        className: "bg-blue-500/50 w-7 h-7 p-1.5 rounded-md text-white",
                    },
                },
            },
            {
                name: "Archived",
                type: "Boolean",
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                },
            },
            {
                name: "Archived_At",
                type: "Timestamp",
                admin: {
                    condition: {
                        list: false,
                        form: false,
                    },
                },
            },
            {
                name: "Address",
                type: "String",
                unique: true,
                admin: {
                    icon: {
                        component: MapPin as React.FC,
                        className: "bg-destructive w-7 h-7 p-1.5 rounded-md text-white",
                    },
                },
            },
            {
                name: "Number",
                type: "Number",
                autoIncrement: true,
                required: true,
            },
            {
                name: "Active",
                type: "Boolean",
                admin: {
                    switch: true,
                    icon: {
                        component: Activity as React.FC,
                        className: "bg-green-500/50 w-7 h-7 p-1.5 rounded-md text-white",
                    },
                },
            },
            {
                name: "ABN",
                type: "String",
                pattern: "^[0-9]{11}$",
                access: ["Office", "Area Manager"],
                unique: true,
                admin: {
                    icon: {
                        component: BriefcaseBusinessIcon as React.FC,
                        className: "bg-yellow-300 dark:bg-yellow-500 w-7 h-7 p-1.5 rounded-md text-white",
                    },
                },
            },
            {
                name: "Revenue",
                type: "Number",
                decimal: 2,
                min: 1000,
                max: 1000000,
                access: ["Office", "Area Manager", "Cleaner"],
                unique: true,
                admin: {
                    slider: true,
                },
            },
            {
                name: "Established",
                type: "Timestamp",
                min: 1712015657000,
                max: 1820147957000,
                restrictUpdate: true,
                admin: {
                    time: true,
                },
            },
            {
                name: "Contacts",
                type: "ManyToMany",
                collection: "Contacts",
                restrictCreate: true,
            },
            {
                name: "Sites",
                type: "ManyToOne",
                collection: "Sites",
            },
            {
                name: "Work_Orders",
                type: "ManyToOne",
                collection: "Work_Orders",
            },
            {
                name: "Start",
                type: "Timestamp",
                required: true,
            },
            {
                type: "Computed",
                name: "Coordinates",
                formula(record: StokerRecord) {
                    if (record.Location) {
                        if (!isNaN(record.Location[0]) && !isNaN(record.Location[1])) {
                            return (record.Location[0] + record.Location[1]).toFixed(6)
                        }
                    }
                    return 0
                },
                access: ["Office", "Area Manager"],
                sorting: true,
                admin: {
                    column: 12,
                    condition: {
                        form: (operation) => operation !== "create",
                    },
                },
            },
            {
                name: "Location",
                type: "Array",
                nullable: true,
                admin: {
                    location: {
                        center: {
                            lat: -37.8136,
                            lng: 144.9631,
                        },
                        zoom: 9,
                    },
                },
            },
        ],
    }
}

export default Companies

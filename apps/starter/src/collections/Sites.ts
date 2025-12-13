import type { CollectionSchema, GenerateSchema, StokerRecord } from "@stoker-platform/types"
import { Store } from "lucide-react"

const Sites: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Sites",
            record: "Site",
        },
        ttl: "Expire_At",
        ai: {
            chat: {
                name: "Stoker",
                roles: ["Office"],
            },
            embedding: true,
        },
        fullTextSearch: ["Name"],
        seedOrder: 4,
        access: {
            serverWriteOnly: true,
            serverReadOnly: ["Subcontractor"],
            operations: {
                assignable: ["Office", "Area Manager", "Client"],
                read: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
                create: ["Office", "Subcontractor"],
                update: ["Office", "Area Manager", "Subcontractor"],
                delete: ["Office", "Subcontractor"],
            },
            entityRestrictions: {
                assignable: ["Area Manager"],
                restrictions: [
                    {
                        type: "Individual",
                        roles: [{ role: "Area Manager" }],
                    },
                    {
                        type: "Parent",
                        collectionField: "Company",
                        roles: [{ role: "Cleaner" }],
                    },
                    {
                        type: "Parent_Property",
                        collectionField: "Company",
                        propertyField: "State",
                        roles: [{ role: "Area Manager" }],
                    },
                ],
            },
        },
        recordTitleField: "Name",
        preloadCache: {
            roles: ["Area Manager", "Cleaner"],
        },
        softDelete: {
            archivedField: "Archived",
            timestampField: "Archived_At",
            retentionPeriod: 7,
        },
        custom: {
            autoCorrectUnique: true,
            setEmbedding(record: StokerRecord) {
                return `This is Site ${record.Name} for the Stoker Platform starter project. The site is located in ${record.State}, Australia.`
            },
        },
        admin: {
            navbarPosition: 3,
            icon: Store as React.FC,
            cards: {
                statusField: "Active",
                headerField: "State",
                sections: [
                    {
                        title: "Site Details",
                        fields: ["Name"],
                        maxSectionLines: 2,
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
                    type: "range",
                    field: "Start",
                    selector: "week",
                },
            ],
        },
        indexExemption: true,
        fields: [
            {
                name: "Name",
                type: "String",
                required: true,
                unique: true,
                maxlength: 255,
                restrictUpdate: ["Office"],
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
                name: "Company",
                type: "OneToMany",
                collection: "Companies",
                includeFields: ["Active"],
                dependencyFields: [{ field: "Name", roles: ["Area Manager"] }],
                required: true,
                restrictUpdate: true,
            },
            {
                name: "Contacts",
                type: "ManyToMany",
                collection: "Contacts",
                twoWay: "Sites",
                min: 1,
                max: 10,
            },
            {
                name: "State",
                type: "String",
                required: true,
                values: ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"],
                restrictUpdate: true,
            },
            {
                name: "Active",
                type: "Boolean",
            },
            {
                name: "Expire_At",
                type: "Timestamp",
                required: true,
                sorting: true,
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
                nullable: true,
            },
            {
                name: "User",
                type: "OneToOne",
                collection: "Users",
                restrictUpdate: ["Office"],
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

export default Sites

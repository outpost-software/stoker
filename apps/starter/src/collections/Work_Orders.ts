import type { CollectionSchema, GenerateSchema, StokerRecord } from "@stoker-platform/types"
import { Title } from "../web/Title.js"

const Work_Orders: GenerateSchema = (): CollectionSchema => {
    return {
        labels: {
            collection: "Work_Orders",
            record: "Work_Order",
        },
        ttl: "Expire_At",
        ai: {
            chat: {
                name: "Stoker",
                defaultQueryLimit: 100,
                roles: ["Office"],
            },
            embedding: true,
        },
        enableWriteLog: true,
        fullTextSearch: ["Name"],
        access: {
            operations: {
                assignable: ["Office"],
                read: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
                create: ["Office", "Area Manager"],
                update: ["Office", "Area Manager"],
                delete: ["Office"],
            },
            attributeRestrictions: [
                {
                    type: "Record_User",
                    collectionField: "Users",
                    roles: [{ role: "Subcontractor" }],
                },
                {
                    type: "Record_Owner",
                    roles: [
                        { role: "Area Manager", assignable: true },
                        { role: "Subcontractor", assignable: true },
                    ],
                },
                {
                    type: "Record_Property",
                    propertyField: "Status",
                    roles: [
                        {
                            role: "Area Manager",
                            values: ["Not Started", "In Progress", "Completed"],
                        },
                        {
                            role: "Cleaner",
                            values: ["Not Started", "In Progress"],
                        },
                    ],
                },
                {
                    type: "Record_Property",
                    propertyField: "Month",
                    roles: [
                        {
                            role: "Client",
                            values: ["January"],
                        },
                    ],
                },
            ],
            entityRestrictions: {
                assignable: ["Area Manager"],
                parentFilters: [
                    {
                        type: "Individual",
                        collectionField: "Site",
                        roles: [{ role: "Area Manager" }],
                    },
                    {
                        type: "Parent",
                        collectionField: "Site",
                        parentCollectionField: "Establishment",
                        roles: [{ role: "Cleaner" }],
                    },
                    {
                        type: "Parent_Property",
                        collectionField: "Site",
                        parentCollectionField: "Establishment",
                        parentPropertyField: "State",
                        roles: [{ role: "Area Manager" }],
                    },
                ],
            },
            files: {
                assignment: {
                    Office: {
                        optional: {
                            read: ["Subcontractor", "Cleaner", "Client"],
                            update: ["Area Manager", "Subcontractor", "Cleaner"],
                        },
                        required: {
                            read: ["Office", "Area Manager"],
                            update: ["Office"],
                            delete: ["Office"],
                        },
                    },
                },
                metadata: {
                    size: " <= (5 * 1024 * 1024)",
                    contentType: ' in ["application/octet-stream"]',
                },
                customMetadata: {
                    collection: ' == "Work_Orders"',
                },
            },
        },
        skipRulesValidation: true,
        recordTitleField: "Name",
        softDelete: {
            archivedField: "Archived",
            timestampField: "Archived_At",
            retentionPeriod: 7,
        },
        roleSystemFields: [{ field: "Created_By", roles: ["Office", "Area Manager"] }],
        preloadCache: {
            roles: ["Office", "Area Manager", "Subcontractor", "Cleaner", "Client"],
            relationCollections: true,
            range: {
                fields: ["Created_At", "Start", "End"],
                labels: ["Created Date", "Start Date", "End Date"],
                ranges: [["Start", "End"]],
                start: "Today",
                end: 30,
                selector: ["week", "month", "range"],
            },
        },
        relationLists: [
            {
                collection: "Companies",
                field: "Work_Orders",
                roles: ["Office"],
            },
            { collection: "Users", field: "Work_Orders", roles: ["Office", "Area Manager"] },
            { collection: "Inbox", field: "Work_Order", roles: ["Office", "Area Manager"] },
        ],
        indexExemption: true,
        custom: {
            autoCorrectUnique: true,
            setEmbedding(record: StokerRecord) {
                return `This is Work Order ${record.Name} for the Stoker Platform starter project. The job is located in ${record.State}, Australia.${record.Status === "Not Started" ? " Work on this job has not yet commenced." : ""}`
            },
        },
        admin: {
            navbarPosition: 4,
            restrictExport: ["Office"],
            titles: {
                collection: "Work Orders",
                record: "Work Order",
            },
            breadcrumbs: ["Establishment", "Site"],
            live: true,
            statusField: {
                field: "Status",
                active: ["Not Started", "In Progress"],
                archived: ["Completed"],
            },
            customFields: [
                {
                    position: 1,
                    component: Title as React.FC,
                    props: {
                        title: "Test Title",
                    },
                },
            ],
            cards: {
                statusField: "Area",
                headerField: "Month",
                sections: [
                    {
                        title: "Details",
                        fields: ["Start", "End", "Area"],
                    },
                    {
                        fields: ["Price"],
                        large: true,
                    },
                ],
                footerField: "State",
            },
            images: {
                imageField: "Photo_URL",
                size: "sm",
                maxHeaderLines: 1,
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
                    defaultAllDay: true,
                },
                fullCalendarSmall: {
                    defaultAllDay: true,
                },
                startField: "Start",
                endField: "End",
                resourceField: "Establishment",
                resourceTitleField: "Name",
                unscheduled: {
                    title: "Unscheduled",
                    roles: ["Office", "Area Manager"],
                },
                dataStart: { months: 6 },
                dataEnd: { months: 6 },
                dataStartOffset: { months: 3 },
                dataEndOffset: { months: 3 },
            },
            filters: [
                {
                    type: "select",
                    field: "Status",
                    style: "radio",
                },
                {
                    type: "select",
                    field: "Area",
                },
                {
                    type: "select",
                    field: "Month",
                    roles: ["Office", "Area Manager"],
                },
                {
                    type: "relation",
                    field: "Establishment",
                    roles: ["Office", "Area Manager"],
                },
                {
                    type: "relation",
                    field: "User",
                    roles: ["Office", "Area Manager"],
                },
                {
                    type: "relation",
                    field: "Site",
                    roles: ["Office", "Area Manager", "Cleaner"],
                },
            ],
            rowHighlight: [
                {
                    condition(record) {
                        return record.Status === "Not Started"
                    },
                    className: "bg-destructive/20 hover:bg-destructive/50 dark:bg-blue-500/50 dark:hover:bg-blue-500",
                },
                {
                    condition(record) {
                        return record.Status === "In Progress"
                    },
                    className: "bg-yellow-100/50 hover:bg-yellow-100 dark:bg-blue-500/20 dark:hover:bg-blue-500/30",
                },
            ],
            formLists: [
                {
                    collection: "Companies",
                    fields: ["Name", "Address"],
                },
                {
                    collection: "Users",
                    fields: ["Name", "Start", "Email"],
                    sortField: "Email",
                    sortDirection: "asc",
                },
                {
                    collection: "Inbox",
                    label: "Messages",
                    fields: ["Received", "Sender", "Status"],
                    sortField: "Received",
                    sortDirection: "desc",
                },
            ],
        },
        fields: [
            {
                name: "Name",
                type: "String",
                required: true,
                unique: true,
                maxlength: 255,
                admin: {
                    readOnly(operation, record) {
                        if (operation === "update" && record?.Status !== "Completed") {
                            return true
                        }
                        return false
                    },
                    description: {
                        message: "The name of the work order.",
                        condition(record) {
                            if (record?.Status !== "Completed") {
                                return false
                            }
                            return true
                        },
                    },
                    textarea: true,
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
                name: "Establishment",
                type: "OneToMany",
                collection: "Companies",
                includeFields: ["Name"],
                dependencyFields: [{ field: "Name", roles: ["Office"] }],
                titleField: "Name",
                constraints: [["Active", "==", true]],
                required: true,
                restrictUpdate: ["Office"],
                description: "The company that the work order is for.",
            },
            {
                name: "Users",
                type: "ManyToMany",
                collection: "Users",
                includeFields: ["Name"],
                restrictUpdate: ["Office"],
                description: "The users that are assigned to the work order.",
                admin: {
                    readOnly(operation) {
                        return operation !== "create"
                    },
                },
            },
            {
                name: "User",
                type: "OneToOne",
                collection: "Users",
                restrictUpdate: ["Office"],
                description: "The user that is in charge of the work order.",
                admin: {
                    listLabel: "Owner",
                },
            },
            {
                name: "Site",
                type: "OneToMany",
                required: true,
                collection: "Sites",
                includeFields: ["Name", "Active"],
                enforceHierarchy: {
                    field: "Establishment",
                    recordLinkField: "Company",
                },
                dependencyFields: [
                    { field: "Name", roles: ["Office", "Area Manager", "Cleaner"] },
                    { field: "Company", roles: ["Office"] },
                    { field: "Active", roles: ["Office"] },
                ],
                restrictUpdate: ["Office"],
                preserve: true,
                description: "The site that work is being carried out on.",
            },
            {
                name: "Contact",
                type: "OneToMany",
                collection: "Contacts",
                includeFields: ["Name"],
            },
            {
                name: "State",
                type: "String",
                required: true,
                restrictUpdate: true,
                values: ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"],
                admin: {
                    readOnly(operation) {
                        return operation !== "create"
                    },
                },
            },
            {
                name: "Status",
                type: "String",
                values: ["Not Started", "In Progress", "Completed"],
                required: true,
                restrictUpdate: ["Office"],
                custom: {
                    serverAccess: {
                        read(role, record) {
                            if (role === "Client") {
                                return record?.Status === "Completed"
                            }
                            return true
                        },
                    },
                },
            },
            {
                name: "Start",
                type: "Timestamp",
                nullable: true,
                required: true,
                description: "The start date of the work order.",
                admin: {
                    time: true,
                },
            },
            {
                name: "End",
                type: "Timestamp",
                description: "The end date of the work order.",
                admin: {
                    readOnly(operation) {
                        return operation !== "create"
                    },
                },
            },
            {
                name: "Price",
                type: "Number",
                decimal: 2,
                restrictUpdate: ["Office", "Area Manager"],
                access: ["Office", "Area Manager", "Subcontractor"],
                description: "The price of the work order, reflecting an amount in Australian dollars.",
            },
            {
                name: "Area",
                type: "Number",
                values: [1, 3, 5],
                access: ["Area Manager"],
            },
            {
                name: "Month",
                type: "Array",
                values: [
                    "January",
                    "February",
                    "March",
                    "April",
                    "May",
                    "June",
                    "July",
                    "August",
                    "September",
                    "October",
                    "November",
                    "December",
                ],
                length: 4,
                required: true,
                restrictUpdate: ["Office"],
                custom: {
                    serverAccess: {
                        read(role, record) {
                            if (role === "Client") {
                                return record?.Status === "Completed"
                            }
                            return true
                        },
                    },
                },
                admin: {
                    tags: ["destructive", "secondary", "bg-green-500", "outline"],
                    readOnly(operation) {
                        return operation !== "create"
                    },
                },
            },
            {
                name: "Signatures",
                type: "Map",
                admin: {
                    readOnly(operation) {
                        return operation !== "create"
                    },
                },
            },
            {
                name: "Expire_At",
                type: "Timestamp",
                required: true,
                admin: {
                    condition: {
                        list: false,
                    },
                },
            },
            {
                name: "Photo_URL",
                type: "String",
                pattern: "^https://firebasestorage\\.googleapis\\.com/.*$",
                admin: {
                    label: "Photo URL",
                    image: true,
                    condition: {
                        list: false,
                    },
                },
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
                },
            },
            {
                name: "Description",
                type: "Map",
                admin: {
                    richText: true,
                    condition: {
                        list: false,
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

export default Work_Orders

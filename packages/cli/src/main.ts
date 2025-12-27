#!/usr/bin/env -S node --no-warnings

import { existsSync } from "fs"
import { Command } from "commander"
import pkg from "../package.json" with { type: "json" }
import { join } from "path"
import dotenv from "dotenv"

if (!existsSync("firebase.json") && process.argv[2] && process.argv[2] !== "init") {
    throw new Error("Please run this command from the root of your Stoker project")
}

if (
    !process.env.GCP_PROJECT &&
    process.argv[2] &&
    ![
        "init",
        "set-project",
        "build-web-app",
        "lint-schema",
        "security-report",
        "generate-firestore-indexes",
        "generate-firestore-rules",
        "generate-storage-rules",
        "add-project",
        "list-projects",
    ].includes(process.argv[2])
) {
    throw new Error("Please set the GCP_PROJECT environment variable")
} else {
    dotenv.config({ path: join(process.cwd(), ".env", `.env.${process.env.GCP_PROJECT}`), quiet: true })
}

if (process.env.GCP_PROJECT) {
    const projectEnvFile = join(process.cwd(), ".env", `.env.project.${process.env.GCP_PROJECT}`)
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (existsSync(projectEnvFile)) {
        dotenv.config({ path: projectEnvFile, quiet: true })
    } else {
        dotenv.config({ path: join(process.cwd(), ".env", ".env"), quiet: true })
    }
} else {
    dotenv.config({ path: join(process.cwd(), ".env", ".env"), quiet: true })
}

import { initProject } from "./project/initProject.js"
import { buildWebApp } from "./project/buildWebApp.js"
import { startEmulators, startWebAppEmulators } from "./project/startEmulators.js"
import { activateMaintenanceMode } from "./deploy/maintenance/activateMaintenanceMode.js"
import { disableMaintenanceMode } from "./deploy/maintenance/disableMaintenanceMode.js"
import { setDeploymentStatus } from "./deploy/maintenance/setDeploymentStatus.js"
import { persistSchema } from "./deploy/schema/persistSchema.js"
import { liveUpdate } from "./deploy/live-update/liveUpdate.js"
import { deployTTLs } from "./deploy/firestore-ttl/deployTTLs.js"
import { generateFirestoreIndexes } from "./deploy/rules-indexes/generateFirestoreIndexes.js"
import { generateFirestoreRules } from "./deploy/rules-indexes/generateFirestoreRules.js"
import { generateStorageRules } from "./deploy/rules-indexes/generateStorageRules.js"
import { deployProject } from "./deploy/deployProject.js"
import { migrateAll } from "./migration/migrateAll.js"
import { exportFirestoreData } from "./deploy/firestore-export/exportFirestoreData.js"
import { exportToBigQuery } from "./data/exportToBigQuery.js"
import { addProject } from "./project/addProject.js"
import { deleteProject } from "./project/deleteProject.js"
import { addRecord } from "./project/addRecord.js"
import { updateRecord } from "./project/updateRecord.js"
import { deleteRecord } from "./project/deleteRecord.js"
import { getOne } from "./project/getOne.js"
import { getSome } from "./project/getSome.js"
import { lintSchema } from "./lint/lintSchema.js"
import { securityReport } from "./lint/securityReport.js"
import { addRecordPrompt } from "./project/addRecordPrompt.js"
import { seedData } from "./data/seedData.js"
import { prepareEmulatorData } from "./project/prepareEmulatorData.js"
import { setProject } from "./project/setProject.js"
import { setUserRole } from "./ops/setUserRole.js"
import { setUserCollection } from "./ops/setUserCollection.js"
import { setUserDocument } from "./ops/setUserDocument.js"
import { getUser } from "./ops/getUser.js"
import { getUserRecord } from "./ops/getUserRecord.js"
import { getUserPermissions } from "./ops/getUserPermissions.js"
import { auditPermissions } from "./ops/auditPermissions.js"
import { explainPreloadQueries } from "./ops/explainPreloadQueries.js"
import { auditDenormalized } from "./ops/auditDenormalized.js"
import { auditRelations } from "./ops/auditRelations.js"
import { listProjects } from "./ops/listProjects.js"
import { customDomain } from "./project/customDomain.js"
import { applySchema } from "./deploy/applySchema.js"
import { addTenant } from "./project/addTenant.js"
import { deleteTenant } from "./project/deleteTenant.js"

const program = new Command()

program.name("stoker").description("Stoker Platform CLI").version(pkg.version)

program
    .command("init")
    .description("bootstrap a new Stoker project")
    .option("-f, --force", "force initialization in a non-empty directory")
    .action((options) => {
        initProject(options)
    })

program
    .command("set-project")
    .description(
        'select a project to work with. Must be used in conjunction with `export GCP_PROJECT="<PROJECT_NAME>"`',
    )
    .action(() => {
        setProject()
    })

program
    .command("emulator-data")
    .description("Copy live app data into the Firebase Emulator Suite")
    .action(() => {
        prepareEmulatorData()
    })

program
    .command("start")
    .description("start the Firebase Emulator Suite")
    .option("-t, --test-mode", "start the Firebase Emulator Suite in test mode")
    .action(() => {
        startEmulators()
    })

program
    .command("start-web-app")
    .description("start the web app Firebase Emulator Suite")
    .action(() => {
        startWebAppEmulators()
    })

program
    .command("build-web-app")
    .description("build the web app")
    .action(() => {
        buildWebApp()
    })

program
    .command("lint-schema")
    .description("lint the Stoker schema")
    .action(() => {
        lintSchema()
    })

program
    .command("security-report")
    .description("run the security report")
    .action(() => {
        securityReport()
    })

program
    .command("deployment")
    .description("toggle deployment status")
    .requiredOption("-s, --status <status>", "idle / in_progress")
    .action((options) => {
        setDeploymentStatus(options.status).then(() => {
            process.exit(0)
        })
    })

program
    .command("maintenance")
    .description("toggle maintenance mode")
    .requiredOption("-s, --status <status>", "on / off")
    .action((options) => {
        if (options.status === "on") {
            activateMaintenanceMode()
        } else {
            disableMaintenanceMode()
        }
    })

program
    .command("live-update")
    .description("trigger a live update")
    .option("-s, --secure", "enforce latest security rules")
    .option("-r, --refresh", "force page refresh")
    .option("-p, --payload <payload>", "additional payload to send to the client")
    .action((options) => {
        liveUpdate(options)
    })

program
    .command("persist-schema")
    .description("persist schema to Firebase")
    .action(() => {
        persistSchema()
    })

program
    .command("deploy-ttls")
    .description("deploy Firestore TTLs")
    .action(() => {
        deployTTLs()
    })

program
    .command("generate-firestore-indexes")
    .description("generate Firestore indexes")
    .action(() => {
        generateFirestoreIndexes()
    })

program
    .command("generate-firestore-rules")
    .description("generate Firestore security rules")
    .action(() => {
        generateFirestoreRules()
    })

program
    .command("generate-storage-rules")
    .description("generate Cloud Storage security rules")
    .action(() => {
        generateStorageRules()
    })

program
    .command("deploy")
    .description("deploy project")
    .option("-e, --export", "export Firestore data before deployment")
    .option("-i, --initial", "initial deployment")
    .option("-r, --retry", "retry failed deployment")
    .option("-s, --secure", "enforce latest security rules")
    .option("--no-firestore-rules", "skip Firestore security rules generation")
    .option("--no-storage-rules", "skip Cloud Storage security rules generation")
    .option("--no-admin", "skip admin app deployment")
    .option("--no-maintenance-on", "skip maintenance mode activation")
    .option("--no-maintenance-off", "skip maintenance mode deactivation")
    .option("--no-refresh", "skip live update page refresh")
    .option("--no-migrate", "skip database migration")
    .action((options) => {
        deployProject(options)
    })

program
    .command("apply")
    .description("apply schema to local environment")
    .action(() => {
        applySchema()
    })

program
    .command("migrate")
    .description("migrate the database")
    .action(() => {
        migrateAll()
    })

program
    .command("custom-domain")
    .description("set a custom domain for the project")
    .requiredOption("-d, --domain <domain>", "the custom domain to set")
    .action((options) => {
        customDomain(options)
    })

program
    .command("export")
    .description("export Firestore data to Cloud Storage")
    .action(() => {
        exportFirestoreData()
    })

program
    .command("bigquery")
    .description("export a Firestore collection to BigQuery")
    .requiredOption("-c, --collection <collection>", "collection to export to BigQuery")
    .option("-f, --fields <fields>", "projection fields")
    .action((options) => {
        exportToBigQuery(options)
    })

program
    .command("seed-data")
    .description("seed test data")
    .requiredOption("-t, --tenant <tenant>", "the tenant to seed data for")
    .requiredOption("-n, --number <number>", "number of records to seed")
    .option("-r, --relations <relations>", "number of relations to seed")
    .option("-s, --subcollections <subcollections>", "number of subcollection records to seed")
    .option("-d", "--delay <milliseconds>", "delay between seeding records")
    .option("-m, --mode <mode>", "development / production")
    .action((options) => {
        seedData(options)
    })

program
    .command("add-project")
    .description("add a Google Cloud project")
    .requiredOption("-n, --name <name>", "the Google Cloud Project ID for the project")
    .option("--no-pitr", "disable Firestore point-in-time recovery")
    .option("--no-versioning", "disable Cloud Storage versioning")
    .option("-s, --soft-delete <duration>", "set Cloud Storage soft delete duration (default 30 days)")
    .option("-b, --backup-recurrence <interval>", "set Firestore backup recurrence interval (default daily)")
    .option("-r, --backup-retention <duration>", "set Firestore backup duration (default 7 days)")
    .option("-c, --custom-cors <path>", "file path for custom Cloud Storage CORS policy")
    .option("-d, --development", "specifies that this will be a development project")
    .option("-t, --test-mode", "add the project in test mode")
    .action((options) => {
        addProject(options)
    })

program
    .command("delete-project")
    .description("delete a Google Cloud project. Be careful!")
    .option("-t, --test-mode", "delete the project in test mode")
    .action((options) => {
        deleteProject(options)
    })

program
    .command("add-tenant")
    .description("add a tenant")
    .action(() => {
        addTenant().then(() => {
            process.exit(0)
        })
    })

program
    .command("delete-tenant")
    .description("delete a tenant")
    .requiredOption("-t, --tenant <tenant>", "the tenant to delete")
    .action((options) => {
        deleteTenant(options)
    })

program
    .command("add-record")
    .description("add a record")
    .option("-m, --mode <mode>", "development / production")
    .requiredOption("-t, --tenant <tenant>", "the tenant to add the record to")
    .requiredOption("-p, --path <path>", "the path of the document")
    .requiredOption("-d, --data <data>", "the data to add")
    .option("-a, --user-data <user>", "data for creating a user")
    .option("-u, --user <user>", "the ID of the user to add the record as")
    .action((options) => {
        addRecord(options)
    })

program
    .command("add-record-prompt")
    .description("add a record to a collection using terminal prompts")
    .option("-m, --mode <mode>", "development / production")
    .requiredOption("-t, --tenant <tenant>", "the tenant to add the record to")
    .requiredOption("-c, --collection <collection>", "the collection to add the record to")
    .option("-a, --full-access", "if the record is a user, grant full access to all collections")
    .action((options) => {
        addRecordPrompt(options.tenant, options.collection, options.fullAccess, options.mode).then(() => {
            process.exit(0)
        })
    })

program
    .command("update-record")
    .description("update a record")
    .option("-m, --mode <mode>", "development / production")
    .requiredOption("-t, --tenant <tenant>", "the tenant of the record")
    .requiredOption("-p, --path <path>", "the path of the document")
    .requiredOption("-i, --id <id>", "the ID of the document")
    .requiredOption("-d, --data <data>", "the data to update")
    .option("-a, --user-data <user>", "data for creating, updating or deleting a user")
    .option("-u, --user <user>", "the ID of the user to update the record as")
    .action((options) => {
        updateRecord(options)
    })

program
    .command("delete-record")
    .description("delete a record")
    .option("-m, --mode <mode>", "development / production")
    .requiredOption("-t, --tenant <tenant>", "the tenant of the record")
    .requiredOption("-p, --path <path>", "the path of the document")
    .requiredOption("-i, --id <id>", "the ID of the document")
    .option("-u, --user <user>", "the ID of the user to delete the record as")
    .option("-f, --force", "force deletion of a record with soft delete enabled")
    .action((options) => {
        deleteRecord(options)
    })

program
    .command("get-one")
    .description("get a record")
    .option("-m, --mode <mode>", "development / production")
    .requiredOption("-t, --tenant <tenant>", "the tenant of the record")
    .requiredOption("-p, --path <path>", "the path of the document")
    .option("-r, --relations <depth>", "retrieve relations at the specified depth")
    .option("-s, --subcollections <depth>", "retrieve subcollections at the specified depth")
    .option("-u, --user <user>", "the ID of the user to get the record as")
    .action((options) => {
        getOne(options)
    })

program
    .command("get-some")
    .description("get multiple records")
    .option("-m, --mode <mode>", "development / production")
    .requiredOption("-t, --tenant <tenant>", "the tenant of the records")
    .requiredOption("-p, --path <path>", "the path of the collection")
    .option("-c, --constraints <constraints>", "contraints to apply to the query")
    .option("-r, --relations <depth>", "retrieve relations at the specified depth")
    .option("-s, --subcollections <depth>", "retrieve subcollections at the specified depth")
    .option("-u, --user <user>", "the ID of the user to get the records as")
    .action((options) => {
        getSome(options)
    })

program
    .command("list-projects")
    .description("list Stoker projects")
    .action(() => {
        listProjects()
    })

program
    .command("set-user-role")
    .description('set the "role" custom claim for a user')
    .requiredOption("-i, --id <id>", "the ID of the user")
    .requiredOption("-r, --role <role>", "the role to set for the user")
    .action((options) => {
        setUserRole(options)
    })

program
    .command("set-user-collection")
    .description('set the "collection" custom claim for a user')
    .requiredOption("-i, --id <id>", "the ID of the user")
    .requiredOption("-c, --collection <collection>", "the collection to set for the user")
    .action((options) => {
        setUserCollection(options)
    })

program
    .command("set-user-document")
    .description('set the "doc" custom claim for a user')
    .requiredOption("-i, --id <id>", "the ID of the user")
    .requiredOption("-d, --doc <document>", "the document ID to set for the user")
    .action((options) => {
        setUserDocument(options)
    })

program
    .command("get-user")
    .description("retrieve a Firebase user")
    .requiredOption("-i, --id <id>", "the ID of the user")
    .action((options) => {
        getUser(options)
    })

program
    .command("get-user-record")
    .description("retrieve a Firestore user record")
    .requiredOption("-t, --tenant <tenant>", "the tenant to get the user record from")
    .requiredOption("-c, --collection <collection>", "the collection the user exists in")
    .requiredOption("-i, --id <id>", "the ID of the user")
    .action((options) => {
        getUserRecord(options)
    })

program
    .command("get-user-permissions")
    .description("retrieve a Firestore user permissions record")
    .option("-m, --mode <mode>", "development / production")
    .requiredOption("-t, --tenant <tenant>", "the tenant to get user permissions from")
    .requiredOption("-i, --id <id>", "the ID of the user")
    .action((options) => {
        getUserPermissions(options)
    })

program
    .command("explain-preload")
    .description("explain / analyze preload cache queries")
    .requiredOption("-t, --tenant <tenant>", "the tenant to analyze queries for")
    .requiredOption("-i, --id <id>", "the ID of a user to analyze queries for")
    .option("-a, --analyze", "analyze queries")
    .action((options) => {
        explainPreloadQueries(options)
    })

program
    .command("audit-permissions")
    .description("detect non-default permissions for roles")
    .requiredOption("-t, --tenant <tenant>", "the tenant to audit permissions for")
    .option("-e, --email <email>", "email address to send the audit report to")
    .option("-m, --mode <mode>", "development / production")
    .action((options) => {
        auditPermissions(options)
    })

program
    .command("audit-denormalized")
    .description("audit denormalized data integrity")
    .requiredOption("-t, --tenant <tenant>", "the tenant to audit denormalized data for")
    .option("-m, --mode <mode>", "development / production")
    .action((options) => {
        auditDenormalized(options)
    })

program
    .command("audit-relations")
    .description("audit relations data integrity")
    .requiredOption("-t, --tenant <tenant>", "the tenant to audit relations for")
    .option("-m, --mode <mode>", "development / production")
    .action((options) => {
        auditRelations(options)
    })

program.parse()

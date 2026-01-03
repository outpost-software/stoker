import { describe, test, expect, afterAll } from "vitest"
import { ChildProcess, spawn } from "node:child_process"
import { mkdir, readdir, rm } from "node:fs/promises"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import {
    addRecord,
    deleteRecord,
    initializeFirebase,
    initializeStoker,
    updateRecord,
} from "@stoker-platform/node-client"
import { join } from "node:path"
import { algoliasearch } from "algoliasearch"
import { getAuth } from "firebase-admin/auth"
import dotenv from "dotenv"

const projectName = `test-project-${Date.now()}`

const resolveCLICommand = async (process: ChildProcess) => {
    await new Promise<void>((resolve, reject) => {
        process.on("close", (code) => {
            if (code === 0) {
                resolve(undefined)
            } else {
                reject(new Error(`Command failed with code ${code}`))
            }
        })
        process.on("error", reject)
    })
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getTenantId = async () => {
    dotenv.config({ path: join(process.cwd(), ".env", ".env"), quiet: true })
    dotenv.config({ path: join(process.cwd(), ".env", `.env.${projectName}`), quiet: true })
    await initializeFirebase()
    const db = getFirestore()
    const tenants = await db.collection("tenants").listDocuments()
    return tenants[0].id
}

const startStoker = async () => {
    process.env.GCP_PROJECT = projectName
    dotenv.config({ path: join(process.cwd(), ".env", ".env"), quiet: true })
    dotenv.config({ path: join(process.cwd(), ".env", `.env.${projectName}`), quiet: true })
    const tenantId = await getTenantId()
    await initializeStoker(
        "production",
        tenantId,
        join(process.cwd(), "lib", "main.js"),
        join(process.cwd(), "lib", "collections"),
    )
}

const getUserId = async () => {
    await startStoker()
    const db = getFirestore()
    const tenantId = await getTenantId()
    const userSnapshot = await db.collection("tenants").doc(tenantId).collection("Users").get()
    const user = userSnapshot.docs.find((doc) => doc.data()?.Email === "another@getoutpost.com")
    return user?.id as string
}

const getAdminId = async () => {
    await startStoker()
    const db = getFirestore()
    const tenantId = await getTenantId()
    const userSnapshot = await db.collection("tenants").doc(tenantId).collection("Users").get()
    const user = userSnapshot.docs.find((doc) => doc.data()?.Email === "test@getoutpost.com")
    return user?.data()?.User_ID as string
}

const getContactId = async () => {
    await startStoker()
    const db = getFirestore()
    const tenantId = await getTenantId()
    const contactSnapshot = await db.collection("tenants").doc(tenantId).collection("Contacts").get()
    return contactSnapshot.docs.find((doc) => doc.data()?.Email === "client@getoutpost.com")?.id as string
}

const getWorkOrderId = async () => {
    await startStoker()
    const db = getFirestore()
    const tenantId = await getTenantId()
    const workOrderSnapshot = await db.collection("tenants").doc(tenantId).collection("Work_Orders").get()
    return workOrderSnapshot.docs[0].id as string
}

describe("CLI", async () => {
    test("init command creates a starter project", async () => {
        await mkdir("test-init", { recursive: true })
        const child = spawn("stoker", ["init"], {
            cwd: "test-init",
            stdio: ["pipe", "pipe", "pipe"],
        })

        await resolveCLICommand(child)

        const files = await readdir("test-init")

        expect(files).toContain(".devcontainer")
        expect(files).toContain(".env")
        expect(files).toContain(".migration")
        expect(files).toContain("bin")
        expect(files).toContain("extensions")
        expect(files).toContain("firebase-emulator-data")
        expect(files).toContain("firebase-rules")
        expect(files).toContain("functions")
        expect(files).toContain("icons")
        expect(files).toContain("src")
        expect(files).toContain("test")
        expect(files).toContain(".gitignore")
        expect(files).toContain(".eslintrc.cjs")
        expect(files).toContain(".firebaserc")
        expect(files).toContain(".prettierignore")
        expect(files).toContain(".prettierrc")
        expect(files).toContain("external.package.json")
        expect(files).toContain("firebase.hosting.json")
        expect(files).toContain("firebase.json")
        expect(files).toContain("package.json")
        expect(files).toContain("remoteconfig.template.json")
        expect(files).toContain("tsconfig.json")
        expect(files).toContain("vitest.config.ts")
        expect(files).toContain("ops.js")

        await rm("test-init", { recursive: true, force: true })
    })

    test("add-project command creates a project", async () => {
        dotenv.config({ path: join(process.cwd(), ".env", ".env"), quiet: true })
        const child = spawn("stoker", ["add-project", "--name", projectName, "--development", "--test-mode"], {
            stdio: ["pipe", "pipe", "pipe"],
        })

        const prompts = [
            { match: "Initial value for Number in collection Companies", input: "100\n" },
            { match: "Initial value for Number in collection Invoices", input: "100\n" },
            { match: "Initial value for Number in collection Users", input: "100\n" },
            { match: "Companies- Name", input: "Test Company\n" },
            { match: "Companies- Address", input: "Test Address\n" },
            { match: "Companies- Active", input: "\n" },
            { match: "Companies- ABN", input: "87125686231\n" },
            { match: "Companies- Revenue", input: "1000\n" },
            { match: "Companies- Established", input: "\n" },
            { match: "Companies- Start", input: `${Date.now()}\n` },
            { match: "Contacts- Name", input: "Test Client\n" },
            { match: "Contacts- Enabled", input: "\n" },
            { match: "Contacts- Role", input: "\n" },
            { match: "Contacts- Email", input: "client@getoutpost.com\n" },
            { match: "Contacts- State", input: "VIC\n" },
            { match: "Contacts- User", input: "\n" },
            { match: "Contacts- Password", input: `${process.env.TEST_PASSWORD}\n` },
            { match: "Settings- Company_Name", input: "Test Company\n" },
            { match: "Settings- Company_Logo", input: "\n" },
            { match: "Users- Name", input: "Test User\n" },
            { match: "Users- Enabled", input: "\n" },
            { match: "Users- Role", input: "\n" },
            { match: "Users- Email", input: "test@getoutpost.com\n" },
            { match: "Users- ID", input: "\n" },
            { match: "Users- Profile_Avatar", input: "\n" },
            { match: "Users- IP_Address", input: "\n" },
            { match: "Users- Contact", input: "\n" },
            { match: "Users- Start", input: `${Date.now()}\n` },
            { match: "Users- Password", input: `${process.env.TEST_PASSWORD}\n` },
        ]

        let promptIndex = 0

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            console.log(output)

            if (promptIndex < prompts.length && output.includes(prompts[promptIndex].match)) {
                await wait(1000)
                child.stdin.write(prompts[promptIndex].input)
                promptIndex++
            }
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 3600000)

    test("set-project command sets project", async () => {
        const child = spawn("stoker", ["set-project"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        await resolveCLICommand(child)
    }, 10000)

    test("add-record-prompt command adds an Area Manager user", async () => {
        dotenv.config({ path: join(process.cwd(), ".env", `.env.${projectName}`), quiet: true })
        const tenantId = await getTenantId()
        const child = spawn(
            "stoker",
            ["add-record-prompt", "--tenant", tenantId, "--collection", "Users", "--full-access"],
            {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...process.env,
                    GCP_PROJECT: projectName,
                },
            },
        )

        const prompts = [
            { match: "Users- Name", input: "Test Area Manager\n" },
            { match: "Users- Enabled", input: "\n" },
            { match: "Users- Role", input: "\u001b[B\n" },
            { match: "Users- Email", input: "area@getoutpost.com\n" },
            { match: "Users- ID", input: "\n" },
            { match: "Users- Profile_Avatar", input: "\n" },
            { match: "Users- IP_Address", input: "\n" },
            { match: "Users- Contact", input: "\n" },
            { match: "Users- Start", input: `${Date.now()}\n` },
            { match: "Users- Password", input: `${process.env.TEST_PASSWORD}\n` },
        ]

        let promptIndex = 0

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            if (promptIndex < prompts.length && output.includes(prompts[promptIndex].match)) {
                await wait(1000)
                child.stdin.write(prompts[promptIndex].input)
                promptIndex++
            }
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 60000)

    test("add-record-prompt command adds a Subcontractor user", async () => {
        const tenantId = await getTenantId()
        const child = spawn(
            "stoker",
            ["add-record-prompt", "--tenant", tenantId, "--collection", "Users", "--full-access"],
            {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...process.env,
                    GCP_PROJECT: projectName,
                },
            },
        )

        const prompts = [
            { match: "Users- Name", input: "Test Subcontractor\n" },
            { match: "Users- Enabled", input: "\n" },
            { match: "Users- Role", input: "\u001b[B\u001b[B\n" },
            { match: "Users- Email", input: "subcontractor@getoutpost.com\n" },
            { match: "Users- ID", input: "\n" },
            { match: "Users- Profile_Avatar", input: "\n" },
            { match: "Users- IP_Address", input: "\n" },
            { match: "Users- Contact", input: "\n" },
            { match: "Users- Start", input: `${Date.now()}\n` },
            { match: "Users- Password", input: `${process.env.TEST_PASSWORD}\n` },
        ]

        let promptIndex = 0

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            if (promptIndex < prompts.length && output.includes(prompts[promptIndex].match)) {
                await wait(1000)
                child.stdin.write(prompts[promptIndex].input)
                promptIndex++
            }
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 60000)

    test("add-record-prompt command adds a Cleaner user", async () => {
        const tenantId = await getTenantId()
        const child = spawn(
            "stoker",
            ["add-record-prompt", "--tenant", tenantId, "--collection", "Users", "--full-access"],
            {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...process.env,
                    GCP_PROJECT: projectName,
                },
            },
        )

        const prompts = [
            { match: "Users- Name", input: "Test Cleaner\n" },
            { match: "Users- Enabled", input: "\n" },
            { match: "Users- Role", input: "\u001b[B\u001b[B\u001b[B\n" },
            { match: "Users- Email", input: "cleaner@getoutpost.com\n" },
            { match: "Users- ID", input: "\n" },
            { match: "Users- Profile_Avatar", input: "\n" },
            { match: "Users- IP_Address", input: "\n" },
            { match: "Users- Contact", input: "\n" },
            { match: "Users- Start", input: `${Date.now()}\n` },
            { match: "Users- Password", input: `${process.env.TEST_PASSWORD}\n` },
        ]

        let promptIndex = 0

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            if (promptIndex < prompts.length && output.includes(prompts[promptIndex].match)) {
                await wait(1000)
                child.stdin.write(prompts[promptIndex].input)
                promptIndex++
            }
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 60000)

    test("emulator-data command imports data", async () => {
        const child = spawn("stoker", ["emulator-data"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 60000)

    test("build-web-app command builds the web app", async () => {
        const child = spawn("stoker", ["build-web-app"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 60000)

    test("add-record command adds a record", async () => {
        const tenantId = await getTenantId()
        const child = spawn(
            "stoker",
            [
                "add-record",
                "-t",
                tenantId,
                "-p",
                "Users",
                "-d",
                '{"Name": "Test User", "Enabled": true, "Role": "Cleaner", "Email": "another@getoutpost.com", "Start": {"_seconds": 1736484988, "_nanoseconds": 0}, "ID": "ee210af5-8449-4adf-b221-f80d2d631bb5"}',
                "-a",
                `{"password": "${process.env.TEST_PASSWORD}", "passwordConfirm": "${process.env.TEST_PASSWORD}", "permissions": {"collections": {"Inbox": {"operations": ["Read", "Create", "Update"], "recordUser": {"active": true}}, "Outbox": {"operations": ["Read", "Create", "Update"], "recordOwner": {"active": true}}, "Sites": {"operations": ["Read"], "restrictEntities": true, "parentEntities": []}, "Work_Orders": {"operations": ["Read"], "recordProperty": {"active": true}}}}}`,
            ],
            {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...process.env,
                    GCP_PROJECT: projectName,
                },
            },
        )

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("update-record command updates a record", async () => {
        const userId = await getUserId()
        const tenantId = await getTenantId()
        await wait(1000)

        const child = spawn(
            "stoker",
            [
                "update-record",
                "-t",
                tenantId,
                "-p",
                "Users",
                "-d",
                '{"Name": "Test User 2", "Photo_URL": "_DELETE_FIELD"}',
                "-i",
                userId,
            ],
            {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...process.env,
                    GCP_PROJECT: projectName,
                },
            },
        )

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("get-one command retrieves a record", async () => {
        const userId = await getUserId()
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["get-one", "-t", tenantId, "-p", `Users/${userId}`], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("get-some command retrieves all records", async () => {
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["get-some", "-t", tenantId, "-p", `Users`], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("delete-record command deletes a record", async () => {
        const userId = await getUserId()
        const tenantId = await getTenantId()
        await wait(1000)

        const child = spawn("stoker", ["delete-record", "-t", tenantId, "-p", "Users", "-i", userId], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("add-record command as user adds a record", async () => {
        const adminId = await getAdminId()
        const tenantId = await getTenantId()
        const child = spawn(
            "stoker",
            [
                "add-record",
                "-t",
                tenantId,
                "-p",
                "Users",
                "-d",
                '{"Name": "Test User", "Enabled": true, "Role": "Cleaner", "Email": "another@getoutpost.com", "Start": {"_seconds": 1736484988, "_nanoseconds": 0}, "ID": "ee210af5-8449-4adf-b221-f80d2d631bb5"}',
                "-a",
                `{"password": "${process.env.TEST_PASSWORD}", "passwordConfirm": "${process.env.TEST_PASSWORD}", "permissions": {"collections": {"Inbox": {"operations": ["Read", "Create", "Update"], "recordUser": {"active": true}}, "Outbox": {"operations": ["Read", "Create", "Update"], "recordOwner": {"active": true}}, "Sites": {"operations": ["Read"], "restrictEntities": true, "parentEntities": []}, "Work_Orders": {"operations": ["Read"], "recordProperty": {"active": true}}}}}`,
                "-u",
                adminId,
            ],
            {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...process.env,
                    GCP_PROJECT: projectName,
                },
            },
        )

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("update-record command as user updates a record", async () => {
        const adminId = await getAdminId()
        const userId = await getUserId()
        const tenantId = await getTenantId()
        await wait(1000)

        const child = spawn(
            "stoker",
            [
                "update-record",
                "-t",
                tenantId,
                "-p",
                "Users",
                "-d",
                '{"Name": "Test User 2", "Photo_URL": "_DELETE_FIELD"}',
                "-i",
                userId,
                "-u",
                adminId,
            ],
            {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...process.env,
                    GCP_PROJECT: projectName,
                },
            },
        )

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("get-one command as user retrieves a record", async () => {
        const adminId = await getAdminId()
        const userId = await getUserId()
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["get-one", "-t", tenantId, "-p", `Users/${userId}`, "-u", adminId], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("get-some command as user retrieves all records", async () => {
        const adminId = await getAdminId()
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["get-some", "-t", tenantId, "-p", `Users`, "-u", adminId], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("delete-record command as user deletes a record", async () => {
        const adminId = await getAdminId()
        const userId = await getUserId()
        const tenantId = await getTenantId()
        await wait(1000)

        const child = spawn("stoker", ["delete-record", "-t", tenantId, "-p", "Users", "-i", userId, "-u", adminId], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("explain-preload command explains preload", async () => {
        const adminId = await getAdminId()
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["explain-preload", "-t", tenantId, "-a", "-i", adminId], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            console.log(output)
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 20000)

    test("audit-permissions command audits permissions", async () => {
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["audit-permissions", "-t", tenantId], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            console.log(output)
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 20000)

    test("audit-denormalized command audits denormalized data", async () => {
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["audit-denormalized", "-t", tenantId], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            console.log(output)
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 20000)

    test("audit-relationships command audits relations", async () => {
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["audit-relations", "-t", tenantId], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            console.log(output)
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 600000)

    test("export command exports data", async () => {
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["export"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("bigquery command exports data", async () => {
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["bigquery", "--collection", "Users"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 30000)

    test("seed-data command seeds data", async () => {
        const tenantId = await getTenantId()
        const child = spawn("stoker", ["seed-data", "-t", tenantId, "-n", "5", "-r", "5", "-m", "production"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child.stdout.on("data", async (data) => {
            const output = data.toString()
            console.log(output)
        })

        child.stderr.on("data", (data) => {
            console.error(data.toString())
        })

        await resolveCLICommand(child)
    }, 180000)

    test("start command starts the Firebase emulator", async () => {
        const child_process = spawn("stoker", ["start", "--test-mode"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child_process.stdout.on("data", async (data) => {
            const output = data.toString()
            console.log(output)
        })

        child_process.stderr.on("data", (data) => {
            console.error(data.toString())
            throw new Error("Error starting Firebase Emulator suite")
        })

        await wait(60000)
        child_process.kill()
    }, 120000)

    test("start-web-app command starts the Firebase Hosting emulator", async () => {
        const child_process = spawn("stoker", ["start-web-app"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                GCP_PROJECT: projectName,
            },
        })

        child_process.stdout.on("data", async (data) => {
            const output = data.toString()
            console.log(output)
        })

        child_process.stderr.on("data", (data) => {
            console.error(data.toString())
            throw new Error("Error starting Firebase Hosting emulator")
        })

        await wait(60000)
        child_process.kill()
    }, 120000)
})

describe("Cloud Functions", async () => {
    test("validateRelations function validates relations", async () => {
        const tenantId = await getTenantId()
        const contactId = await getContactId()
        const adminId = await getAdminId()
        await startStoker()
        const db = getFirestore()
        const record = await addRecord(
            ["Users"],
            {
                Name: "Test User",
                Email: "another@getoutpost.com",
                Role: "Cleaner",
                Enabled: true,
                Contact: {
                    [contactId]: {
                        Collection_Path: ["Contacts"],
                        Name: "Test Contact 1000",
                    },
                },
                Start: Timestamp.now(),
            },
            undefined,
            adminId,
        )
        functionsUserId = record.id

        await wait(20000)

        const persistedSnapshot = await db.collection("tenants").doc(tenantId).collection("Users").doc(record.id).get()
        const persistedRecord = persistedSnapshot.data()
        expect(persistedRecord?.Contact[contactId].Name).toBe("Test Client")
    }, 30000)

    test("autoIncrement function increments record number", async () => {
        const tenantId = await getTenantId()
        const userId = await getUserId()
        await startStoker()
        const db = getFirestore()
        const snapshot = await db.collection("tenants").doc(tenantId).collection("Users").doc(userId).get()
        expect(snapshot.data()?.Number).not.toBeNaN()
        const dependency1 = await db
            .collection("tenants")
            .doc(tenantId)
            .collection("system_fields")
            .doc("Users")
            .collection("Users-1")
            .doc(userId)
            .get()
        expect(dependency1.data()?.Number).toBe(snapshot.data()?.Number)
        const dependency2 = await db
            .collection("tenants")
            .doc(tenantId)
            .collection("system_fields")
            .doc("Users")
            .collection("Users-2")
            .doc(userId)
            .get()
        expect(dependency2.data()?.Number).toBe(snapshot.data()?.Number)
    })

    test("fullTextSearch adds a record to the search index", async () => {
        const userId = await getUserId()
        await startStoker()
        if (!process.env.ALGOLIA_ID || !process.env.ALGOLIA_ADMIN_KEY) {
            throw new Error("Algolia ID and admin key must be set")
        }

        await wait(20000)

        const client = algoliasearch(process.env.ALGOLIA_ID, process.env.ALGOLIA_ADMIN_KEY)
        const record = await client.getObject({ indexName: "Users", objectID: userId })
        expect(record.objectID).toBe(userId)
    }, 30000)

    let functionsUserId: string

    test("updateIncludeFields function updates include fields", async () => {
        const tenantId = await getTenantId()
        const contactId = await getContactId()
        await startStoker()
        const db = getFirestore()
        await updateRecord(["Contacts"], contactId, {
            Name: "Test Contact 2",
        })

        await wait(20000)

        const snapshot = await db.collection("tenants").doc(tenantId).collection("Users").doc(functionsUserId).get()
        const record = snapshot.data()
        expect(record?.Contact[contactId].Name).toBe("Test Contact 2")
    }, 30000)

    test("removeRelations function removes relations", async () => {
        const tenantId = await getTenantId()
        const contactId = await getContactId()
        await startStoker()
        const db = getFirestore()
        await deleteRecord(["Contacts"], contactId)

        await wait(20000)

        const snapshot = await db.collection("tenants").doc(tenantId).collection("Users").doc(functionsUserId).get()
        const record = snapshot.data()
        expect(record?.Contact[contactId]).toBeUndefined()
    }, 30000)

    test("validateDenormalized function validates denormalized data", async () => {
        const tenantId = await getTenantId()
        const workOrderId = await getWorkOrderId()
        await startStoker()
        const db = getFirestore()
        await updateRecord(["Work_Orders"], workOrderId, {
            Name: "Test Work Order 2",
        })

        await wait(20000)

        const snapshot = await db
            .collection("tenants")
            .doc(tenantId)
            .collection("system_fields")
            .doc("Work_Orders")
            .collection("Work_Orders-1")
            .doc(workOrderId)
            .get()
        const record = snapshot.data()
        expect(record?.Name).toBe("Test Work Order 2")
    }, 30000)

    test("verifyWriteLog function verifies write log", async () => {
        const tenantId = await getTenantId()
        await startStoker()
        const db = getFirestore()
        const snapshot = await db
            .collection("tenants")
            .doc(tenantId)
            .collection("Users")
            .doc(functionsUserId)
            .collection("system_write_log")
            .get()
        snapshot.forEach((doc) => {
            expect(doc.data()?.status).toBe("verified")
        })
    })

    test("validateFields function sends an email", async () => {
        const tenantId = await getTenantId()
        const workOrderId = await getWorkOrderId()
        await startStoker()
        const db = getFirestore()
        await db.collection("tenants").doc(tenantId).collection("Work_Orders").doc(workOrderId).update({
            Last_Write_At: Timestamp.now(),
            Last_Write_By: "Systems",
        })
        await wait(20000)
    }, 30000)

    test("validateUser function deletes invalid user", async () => {
        await startStoker()
        const auth = getAuth()
        await auth.createUser({
            email: "invalid-user@getoutpost.com",
            password: process.env.TEST_PASSWORD,
        })

        await wait(60000)

        const user = await auth.getUserByEmail("invalid-user@getoutpost.com").catch(() => null)
        expect(user).toBeNull()
    }, 90000)
})

afterAll(async () => {
    const child = spawn("stoker", ["delete-project", "--test-mode"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
            ...process.env,
            GCP_PROJECT: projectName,
        },
    })

    child.stderr.on("data", (data) => {
        console.error(data.toString())
    })

    await resolveCLICommand(child)
}, 60000)

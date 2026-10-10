import type { CollectionSchema } from "@stoker-platform/types"
import { basename, extname } from "node:path"
import type { Locator, Page } from "@playwright/test"
import { expect, test } from "../config/fixtures.js"
import type { StokerLocators } from "../config/locators.js"
import type { StokerProject } from "../config/project.js"
import { openFixtureRecord } from "./utils/list.js"
import { readableFixtures } from "../config/records.js"
import { skipCollection, type ConformanceOptions } from "../config/options.js"

interface PermissionChange {
    id: string
    checked: boolean
}

const FILE = { name: "upload.txt", mimeType: "text/plain", buffer: Buffer.from("file test") }

const named = (name: string, role: string) => {
    const extension = extname(name)
    return extension ? `${basename(name, extension)}-${role.toLowerCase()}${extension}` : `${name} ${role}`
}

export const fileConformance = (options: ConformanceOptions) => {
    test.describe("files", () => {
        test("upload a file and assign permissions", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const name = named("upload.txt", role)
                    const change = await uploadFile(page, name)
                    if (change) await expectPermission(page, name, change)
                })
            }
        })

        test("rename a file", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const source = named("rename-source.txt", role)
                    const target = named("rename-target.txt", role)
                    await uploadFile(page, source)
                    const row = fileRow(page, source)
                    await row.getByTestId("file-rename").click()
                    await row.getByRole("textbox").fill(target)
                    await row.getByRole("button", { name: "Save", exact: true }).click()
                    await expect(fileRow(page, target)).toBeVisible({ timeout: 30000 })
                })
            }
        })

        test("rename a file with Rename Files", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const source = named("bulk-source.txt", role)
                    const target = named("bulk-target.txt", role)
                    await uploadFile(page, source)
                    await page.getByRole("button", { name: "Rename Files", exact: true }).click()
                    await fileRow(page, source).getByRole("textbox").fill(target)
                    await page.getByRole("button", { name: "Rename All", exact: true }).click()
                    await expect(fileRow(page, target)).toBeVisible({ timeout: 30000 })
                })
            }
        })

        test("download a file", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const name = named("download.txt", role)
                    await uploadFile(page, name)
                    const download = page.waitForEvent("download")
                    await fileRow(page, name).getByTestId("file-download").click()
                    expect((await download).suggestedFilename()).toBe(name)
                })
            }
        })

        test("update file permissions", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const name = named("permissions.txt", role)
                    await uploadFile(page, name)
                    await updatePermissions(page, name)
                })
            }
        })

        test("delete a file", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const name = named("delete-me.txt", role)
                    await uploadFile(page, name)
                    await deleteItem(page, name, "File")
                })
            }
        })

        test("create a folder", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const name = named("Created Folder", role)
                    const change = await createFolder(page, name)
                    if (change) await expectPermission(page, name, change)
                })
            }
        })

        test("add a file to a folder", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 180000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const folder = named("Nested Folder", role)
                    await createFolder(page, folder)
                    await openFolder(page, folder)
                    await uploadFile(page, named("nested.txt", role))
                    await expect(page.getByText(folder, { exact: true })).toBeVisible()
                })
            }
        })

        test("update folder permissions", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const name = named("Permissions Folder", role)
                    await createFolder(page, name)
                    await updatePermissions(page, name)
                })
            }
        })

        test("delete a folder", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skipSuites?.editing, "editing was skipped, so no record was created")
            const collections = await readableFixtures(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 180000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    if (skipCollection(options, role, collection.labels.collection)) return
                    await openFiles(page, ui, collection, project, role)
                    const folder = named("Removed Folder", role)
                    await createFolder(page, folder)
                    await openFolder(page, folder)
                    await uploadFile(page, named("removed.txt", role))
                    await page.getByRole("button", { name: "Back", exact: true }).click()
                    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeHidden()
                    await waitForFileList(page)
                    await deleteItem(page, folder, "Folder")
                })
            }
        })
    })
}

const fileRow = (page: Page, name: string) => page.locator(`[data-testid="file-row"][data-file-name="${name}"]`)

const waitForFileList = async (page: Page) => {
    await expect
        .poll(
            async () => {
                if ((await page.getByTestId("files-loading").count()) > 0) return "loading"
                if ((await page.getByText("No files found", { exact: true }).count()) > 0) return "ready"
                if ((await page.getByTestId("file-row").count()) > 0) return "ready"
                return "pending"
            },
            { timeout: 30000 },
        )
        .toBe("ready")
}

const openFiles = async (
    page: Page,
    ui: StokerLocators,
    collection: CollectionSchema,
    project: StokerProject,
    role: string,
) => {
    await openFixtureRecord(page, ui, collection, project, role)
    await page.getByRole("button", { name: "Files", exact: true }).click()
    await expect(page.getByRole("button", { name: "New Folder", exact: true })).toBeVisible()
    await expect(page.getByTestId("file-upload")).toBeAttached()
    await waitForFileList(page)
}

const togglePermission = async (dialog: Locator): Promise<PermissionChange | undefined> => {
    const boxes = dialog.getByRole("checkbox")
    const count = await boxes.count()
    for (let index = 0; index < count; index++) {
        const box = boxes.nth(index)
        if (await box.isDisabled()) continue
        const id = await box.getAttribute("id")
        if (!id) continue
        const checked = !(await box.isChecked())
        await box.setChecked(checked)
        return { id, checked }
    }
    return undefined
}

const applyPermissionsIfShown = async (page: Page, ready: Locator) => {
    const dialog = page.getByRole("dialog", { name: /^Assign Permissions/ })
    await expect(dialog.or(ready)).toBeVisible({ timeout: 30000 })
    if (!(await dialog.isVisible())) return
    const change = await togglePermission(dialog)
    await dialog.getByRole("button", { name: "Apply Permissions", exact: true }).click()
    await expect(dialog).toBeHidden()
    return change
}

const uploadFile = async (page: Page, name: string) => {
    await page.getByTestId("file-upload").setInputFiles(FILE)
    const filenameDialog = page.getByRole("dialog", { name: "Edit Filename", exact: true })
    await expect(filenameDialog).toBeVisible()
    await filenameDialog.getByRole("textbox").fill(name)
    await filenameDialog.getByRole("button", { name: "Upload", exact: true }).click()
    await expect(filenameDialog).toBeHidden()
    const row = fileRow(page, name)
    const change = await applyPermissionsIfShown(page, row)
    await expect(row).toBeVisible({ timeout: 30000 })
    return change
}

const expectPermission = async (page: Page, name: string, change: PermissionChange | undefined) => {
    if (!change) throw new Error(`${name} did not change a permission`)
    await fileRow(page, name).getByTestId("file-permissions").click()
    const dialog = page.getByRole("dialog", { name: /^Assign Permissions/ })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator(`[id="${change.id}"]`)).toBeChecked({ checked: change.checked })
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toBeHidden()
}

const updatePermissions = async (page: Page, name: string) => {
    const button = fileRow(page, name).getByTestId("file-permissions")
    if ((await button.count()) === 0) return
    await button.click()
    const dialog = page.getByRole("dialog", { name: /^Assign Permissions/ })
    await expect(dialog).toBeVisible()
    const change = await togglePermission(dialog)
    if (!change) {
        await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
        await expect(dialog).toBeHidden()
        return
    }
    await dialog.getByRole("button", { name: "Apply Permissions", exact: true }).click()
    await expect(dialog).toBeHidden()
    await expectPermission(page, name, change)
}

const createFolder = async (page: Page, name: string) => {
    await page.getByRole("button", { name: "New Folder", exact: true }).click()
    await page.getByPlaceholder("Enter folder name").fill(name)
    await page.getByRole("button", { name: "Create", exact: true }).click()
    const folder = page.getByRole("button", { name, exact: true })
    const change = await applyPermissionsIfShown(page, folder)
    await expect(folder).toBeVisible({ timeout: 30000 })
    return change
}

const openFolder = async (page: Page, name: string) => {
    await page.getByRole("button", { name, exact: true }).click()
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible()
    await waitForFileList(page)
}

const deleteItem = async (page: Page, name: string, kind: "File" | "Folder") => {
    await fileRow(page, name).getByTestId("file-delete").click()
    const alert = page.getByRole("alertdialog")
    await expect(alert.getByRole("heading", { name: `Delete ${kind}`, exact: true })).toBeVisible()
    await alert.getByRole("button", { name: "Delete", exact: true }).click()
    await expect
        .poll(
            async () => {
                if ((await page.getByTestId("files-loading").count()) > 0) return false
                return (await fileRow(page, name).count()) === 0
            },
            { timeout: 30000 },
        )
        .toBe(true)
}

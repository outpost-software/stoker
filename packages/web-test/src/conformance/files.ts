import type { CollectionSchema } from "@stoker-platform/types"
import type { Locator, Page } from "@playwright/test"
import { expect, test } from "../fixtures.js"
import type { StokerLocators } from "../locators.js"
import type { StokerProject } from "../project.js"
import { openFixtureRecord } from "../utils/list.js"
import { fixtureCollections, type ConformanceOptions } from "../utils/options.js"

interface PermissionChange {
    id: string
    checked: boolean
}

const FILE = { name: "upload.txt", mimeType: "text/plain", buffer: Buffer.from("file test") }

export const fileConformance = (options: ConformanceOptions) => {
    test.describe("files", () => {
        test("upload a file and assign permissions", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    const change = await uploadFile(page, "upload.txt")
                    if (change) await expectPermission(page, "upload.txt", change)
                })
            }
        })

        test("rename a file", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    await uploadFile(page, "rename-source.txt")
                    const row = fileRow(page, "rename-source.txt")
                    await row.getByTestId("file-rename").click()
                    await row.getByRole("textbox").fill("rename-target.txt")
                    await row.getByRole("button", { name: "Save", exact: true }).click()
                    await expect(fileRow(page, "rename-target.txt")).toBeVisible({ timeout: 30000 })
                })
            }
        })

        test("rename a file with Rename Files", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    await uploadFile(page, "bulk-source.txt")
                    await page.getByRole("button", { name: "Rename Files", exact: true }).click()
                    await fileRow(page, "bulk-source.txt").getByRole("textbox").fill("bulk-target.txt")
                    await page.getByRole("button", { name: "Rename All", exact: true }).click()
                    await expect(fileRow(page, "bulk-target.txt")).toBeVisible({ timeout: 30000 })
                })
            }
        })

        test("download a file", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    await uploadFile(page, "download.txt")
                    const download = page.waitForEvent("download")
                    await fileRow(page, "download.txt").getByTestId("file-download").click()
                    expect((await download).suggestedFilename()).toBe("download.txt")
                })
            }
        })

        test("update file permissions", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    await uploadFile(page, "permissions.txt")
                    await updatePermissions(page, "permissions.txt")
                })
            }
        })

        test("delete a file", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    await uploadFile(page, "delete-me.txt")
                    await deleteItem(page, "delete-me.txt", "File")
                })
            }
        })

        test("create a folder", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    const change = await createFolder(page, "Created Folder")
                    if (change) await expectPermission(page, "Created Folder", change)
                })
            }
        })

        test("add a file to a folder", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 180000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    await createFolder(page, "Nested Folder")
                    await openFolder(page, "Nested Folder")
                    await uploadFile(page, "nested.txt")
                    await expect(page.getByText("Nested Folder", { exact: true })).toBeVisible()
                })
            }
        })

        test("update folder permissions", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 120000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    await createFolder(page, "Permissions Folder")
                    await updatePermissions(page, "Permissions Folder")
                })
            }
        })

        test("delete a folder", async ({ page, schema, role, ui, project }) => {
            test.skip(!!options.skip?.editing, "editing was skipped, so no record was created")
            const collections = fixtureCollections(schema, role, project, options)
            test.skip(collections.length === 0, `${role} has no record with files`)
            test.setTimeout(Math.max(180000, collections.length * 180000))
            for (const collection of collections) {
                await test.step(collection.labels.collection, async () => {
                    await openFiles(page, ui, collection, project)
                    await createFolder(page, "Removed Folder")
                    await openFolder(page, "Removed Folder")
                    await uploadFile(page, "removed.txt")
                    await page.getByRole("button", { name: "Back", exact: true }).click()
                    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeHidden()
                    await waitForFileList(page)
                    await deleteItem(page, "Removed Folder", "Folder")
                })
            }
        })
    })
}

const fileRow = (page: Page, name: string) => page.locator(`[data-testid="file-row"][data-file-name="${name}"]`)

const openFiles = async (page: Page, ui: StokerLocators, collection: CollectionSchema, project: StokerProject) => {
    await openFixtureRecord(page, ui, collection, project)
    await page.getByRole("button", { name: "Files", exact: true }).click()
    await expect(page.getByRole("button", { name: "New Folder", exact: true })).toBeVisible()
    await expect(page.getByTestId("file-upload")).toBeAttached()
    await waitForFileList(page)
}

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

const applyPermissionsIfShown = async (page: Page, ready: Locator) => {
    const dialog = page.getByRole("dialog", { name: /^Assign Permissions/ })
    await expect(dialog.or(ready)).toBeVisible({ timeout: 30000 })
    if (!(await dialog.isVisible())) return
    const change = await togglePermission(dialog)
    await dialog.getByRole("button", { name: "Apply Permissions", exact: true }).click()
    await expect(dialog).toBeHidden()
    return change
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

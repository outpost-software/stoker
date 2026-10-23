---
sidebar_position: 5
---

This section covers testing your Stoker project.

## Overview

Stoker projects come with three kinds of tests:

| Type | Location | Command | Details |
| --- | --- | --- | --- |
| Unit tests | `test/unit` | `npm test` | Powered by [Vitest](https://vitest.dev/). Test your collection files, hooks and utilities in Node. |
| Component tests | `test/component` | `npm test` | Powered by [Vitest Browser Mode](https://vitest.dev/guide/browser/). Test your custom React components in a real browser. |
| End-to-end (e2e) tests | `test/e2e` | `npm run test:web` | Powered by [Playwright](https://playwright.dev/). Run the platform's conformance tests and your project's own e2e tests, once for each role. |

We recommend running `npm test` first, then `npm run test:web`.

Use `npm run test:web:ui` to run the e2e tests in [Playwright UI Mode](https://playwright.dev/docs/test-ui-mode).

## Conformance Tests

The platform's conformance tests are run from `test/e2e/platform.spec.ts`:

```ts
import { runWebConformance } from "@stoker-platform/web-test"
runWebConformance()
```

The conformance tests read your schema and check that your app works for each role. They cover:

| Suite | Details |
| --- | --- |
| `access` | Ensures each role can open the collections it can read, and cannot open the collections it can't read. |
| `record editing` | Ensures each role can create and update the records in your [fixture](#fixtures). |
| `collection pages` | Covers search, AI chat, filters, export, sorting and board views. |
| `calendar` | Covers adding, moving, resizing and deleting records from calendar views. |
| `record pages` | Covers duplicating, reverting and converting records, and relation lists. |
| `files` | Covers uploading, renaming, downloading and deleting files and folders, and updating file permissions. |

### Skipping Tests

You can pass options to `runWebConformance` to skip tests that don't apply to your app.

The conformance tests are designed to be flexible, but they may not always cover every variation of a Stoker app. In some cases you might want to skip a failing test and write a new test that covers your unique scenario. This can be done in `test/e2e/project.spec.ts`.

If you find that a test doesn't support your app's configuration, feel free to report it to us so we can keep improving the included test suite.

| Option | Details |
| --- | --- |
| `skipCollections` | Collection names to leave out of the conformance tests entirely. |
| `skipSuites` | Skip whole suites. Accepts `access`, `editing`, `collections` and `records`. |
| `skipTests` | Skip individual tests (see the format below). |

```ts
import { runWebConformance } from "@stoker-platform/web-test"
runWebConformance({
    skipTests: [
        {
            suite: "collection pages",
            test: "search all opens a record",
            collections: ["Quotes", "Invoices"],
            roles: ["Administrator", "Management"],
        },
        {
            suite: "collection pages",
            test: "sort fields match on board and images",
            collections: true,
            roles: ["Client"],
        },
    ],
})
```

## Roles

The e2e tests run once for each role that has a test user. To set up your test users:

1. Create a user for each role in your development app at `<PROJECT_NAME>.web.app`
2. Run `export GCP_PROJECT=<PROJECT_NAME> && stoker set-project` in your project's directory.
3. Run `stoker emulator-data`. This copies your live app data, including the new users, into the Firebase Emulator Suite.
4. Add each user to the `users` object in `stoker-test.json` in your project root, keyed by role:

```json
{
    "users": {
        "Management": {
            "email": "management@example.com",
            "password": "MyTestPassword"
        },
        "Staff Member": {
            "email": "staff@example.com",
            "password": "MyTestPassword"
        },
        "Client": {
            "email": "client@example.com",
            "password": "MyTestPassword"
        }
    },
    "records": {}
}
```

## Fixtures

The `records` object in `stoker-test.json` describes a test record for each collection. The `record editing` suite fills out the create form for each collection using the `create` values, saves the record, then opens it and applies the `update` values.

Records are keyed by collection name, then field name:

```json
{
    "records": {
        "Regions": {
            "Name": {
                "create": "Test Region",
                "update": "Test Region 2"
            },
            "Description": {
                "create": "Test Description",
                "update": "Test Description 2"
            }
        },
        "Staff": {
            "Name": {
                "create": "Test Staff Member",
                "update": "Test Staff Member 2"
            },
            "Email": {
                "create": "test@example.com",
                "update": "test2@example.com"
            },
            "Photo_URL": {
                "create": "icons/logo-small.png",
                "update": "icons/logo-large.png"
            },
            "Region": {
                "create": "Test Region 2"
            },
            "Enabled": {
                "create": "true",
                "update": "false"
            },
            "Role": {
                "create": "Management"
            }
        }
    }
}
```

Enter fields in the following formats:

| Field | Value |
| --- | --- |
| Text, number and rich text fields | The text to type, i.e. `"Test Name"` or `"100.00"`. |
| Boolean fields | `"true"` or `"false"`. |
| Choice fields | The option label, exactly as shown in the form. |
| Date fields | `"YYYY-MM-DD"` |
| Date-time fields | `"YYYY-MM-DD HH:mm"` |
| Time fields | `"HH:mm"` |
| Image fields | A file path relative to your project root, i.e. `"icons/logo-small.png"`. |
| Slider fields | A number, i.e. `"50"`. |
| Relation fields | The title of the related record. Always use the record's "update" value from the fixture if it has one- otherwise use the "create" value. For same-collection relation fields, always use the "create" value. |

**Set `seedOrder` on every collection in your fixture.** Collections are processed in [`seedOrder`](/docs/api-reference/Collection%20Files#seedorder) order, and collections without a `seedOrder` are processed last. A collection must come after every collection it relates to, otherwise the related record won't exist yet when the form is filled in.

## Project Tests

You can write your own e2e tests in `test/e2e/project.spec.ts`. Like the conformance tests, project tests run once for each role, after the conformance tests for that role.

Import `test` and `expect` from `@stoker-platform/web-test` instead of `@playwright/test`. This gives each test these fixtures in addition to Playwright's:

| Fixture | Details |
| --- | --- |
| `role` | The role the test is running as. |
| `schema` | Your published schema. |
| `project` | Your project config, including `project.records` (your fixture). |
| `ui` | Locators for common parts of the app, i.e. `ui.app.root` and `ui.record.save`. |

Because the conformance tests have already run, the records from your fixture exist and can be used in your project tests. These helpers are exported from `@stoker-platform/web-test`:

| Helper | Details |
| --- | --- |
| `fixtureRecordId(project, collection, role)` | The ID of the fixture record for the specified collection. |
| `fixtureRecord(project, collection, role)` | The Firestore snapshot for that record. |
| `recordPath(collection, id)` | The web app path for a record. |
| `collectionPath(collection)` | The web app path for a collection. |

Example:

```ts
import { expect, test, fixtureRecordId, recordPath } from "@stoker-platform/web-test"
import { roleHasOperationAccess } from "@stoker-platform/utils"

test.describe("billing", () => {
    test.beforeEach(({ role, schema }) => {
        const canEdit = roleHasOperationAccess(schema.collections.Invoices, role, "update")
        test.skip(!canEdit, `${role} cannot edit Invoices`)
    })

    test("billing details can be saved", async ({ page, role, schema, project, ui }) => {
        const collectionSchema = schema.collections.Invoices
        const recordId = await fixtureRecordId(project, collectionSchema, role)
        await page.goto(`${recordPath(collectionSchema, recordId)}/billing`)
        await expect(page.getByRole("heading", { name: "Customer Details", exact: true })).toBeVisible()
        await page.getByLabel("Heading").fill("Billing Heading")
        await page.getByRole("button", { name: "Save", exact: true }).click()
        await expect(page.getByText("Billing details saved", { exact: true })).toBeVisible()
        await expect(ui.app.root).toHaveAttribute("data-pending-writes", "0")
    })
})
```

:::tip
Wait for `ui.app.root` to have `data-pending-writes` set to `"0"` after saving, before reloading the page or checking the database. This makes sure the write has reached the emulator.
:::

## Configuration

The e2e tests are configured in `playwright.config.ts`:

```ts
import { defineStokerWebTest } from "@stoker-platform/web-test/config"
export default defineStokerWebTest()
```

`defineStokerWebTest` accepts these options:

| Option | Details |
| --- | --- |
| `testDir` | Where your e2e tests live. Defaults to `test/e2e`. |
| `manageServers` | Start the emulators and the web app dev server as part of the run. Defaults to `true`. |
| `baseURL` | The web app origin. Defaults to `http://localhost:5173`. |
| `users` | Test users, instead of reading them from `stoker-test.json`. |
| `records` | Fixture records, instead of reading them from `stoker-test.json`. |
| `ports` | Emulator ports. Defaults to the ports in `firebase.json`. |
| `overrides` | [Playwright config](https://playwright.dev/docs/test-configuration) overrides. |

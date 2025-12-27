---
sidebar_position: 1
---

The env files in your project describe your back end infrastructure preferences.

## File Types

There are 4 file types:

### `.env/.env`
This is your default preferences file.

### Project env files
A project env file overrides the default preferences above for a specified project. Create an env file for a project using the naming format `.env/.env.project.<PROJECT_NAME>`. Do this **before** creating the project.

### `.env/.env.dev`

This file describes preferences for your development environment (development projects). Env vars in this file will override preferences in your main env file, but only for development. This file is not included by default- you have to create it yourself.

### System env files

Each project gets its own automatically generated env file with the format `.env.<PROJECT_NAME>`. These files are for system use and don't need to be modified.

## `.env/.env`

### Contact Information

#### `ADMIN_EMAIL` (Required)

The email address to be used for system notifications.

#### `ADMIN_SMS` (Required)

The phone number to be used for system notifications.

### Google Cloud Config

Your Stoker apps run on Google Cloud projects, which are also Firebase projects.

#### `GCP_BILLING_ACCOUNT` (Required)

Your [Google Cloud Billing Account ID](https://docs.cloud.google.com/billing/docs/how-to/find-billing-account-id)

#### `GCP_ORGANIZATION`

An optional Google Cloud Organization that GCP projects will be created under.

#### `GCP_FOLDER`

An optional Google Cloud Folder that GCP projects will be created under.

#### `FB_GOOGLE_ANALYTICS_ACCOUNT_ID`

Analytics for your projects will be tracked under this account.

### Firestore Config

App data for your projects is stored in Cloud Firestore.

#### `FB_FIRESTORE_REGION` (Required)

The region for your Firestore databases. Must be a valid [Firestore region](https://firebase.google.com/docs/firestore/locations).

#### `FB_FIRESTORE_ENABLE_PITR`

Whether or not to enable [point-in-time-recovery](https://firebase.google.com/docs/firestore/pitr) for Firestore.

Must be set to `true` or `false`.

Defaults to `false`.

#### `FB_FIRESTORE_BACKUP_RECURRENCE`

The backup frequency for your Firestore databases. Must be `"daily"` or `"weekly"`.

Defaults to `"daily"`.

#### `FB_FIRESTORE_BACKUP_RETENTION`

The amount of days to store Firestore backups for i.e. `"30d"`.

Defaults to `"7d"`.

### Realtime Database Config

Your app's schemas are stored in the Firebase Realtime Database.

#### `FB_DATABASE_REGION` (Required)

The region for your Firebase Realtime database. Must be a valid [Realtime Database region](https://firebase.google.com/docs/database/locations).

### Cloud Storage Config

Uploaded files for your projects are stored in Google Cloud Storage.

#### `FB_STORAGE_REGION` (Required)

The region for your Cloud Storage buckets. Must be a valid [Cloud Storage region](https://docs.cloud.google.com/storage/docs/locations).

#### `FB_STORAGE_ENABLE_VERSIONING`

Whether or not to enable [Object Versioning](https://docs.cloud.google.com/storage/docs/object-versioning) for Cloud Storage.

Must be set to `true` or `false`.

Defaults to `false`.

#### `FB_STORAGE_SOFT_DELETE_DURATION`

Soft delete is enabled on your Cloud Storage buckets.

Set the number of days to retain deleted files for ie. `"7d"`

Defaults to `"30d"`.

### Firebase Auth Config

Authentication for your app is managed by Firebase Auth.

#### `FB_AUTH_PASSWORD_POLICY` (Required)

Must be a valid [Password Policy](https://docs.cloud.google.com/identity-platform/docs/password-policy#enable_enforcement).

This policy is currently only set up on project creation.

#### `FB_AUTH_PASSWORD_POLICY_UPGRADE` (Required)

Determines whether updates changes to your password policy will be enforced on existing users.

Must be set to `true` or `false`.

### Cloud Functions Config

Server operations for your app are run using Cloud Run Functions.

#### `FB_FUNCTIONS_REGION` (Required)

The region for your Cloud Functions. Must be a valid [Cloud Functions 2nd Gen region](https://firebase.google.com/docs/functions/locations).

#### `FB_FUNCTIONS_V1_REGION`

One back-end function is still run on Cloud Functions v1 infrastructure.

Must be a Must be a valid [Cloud Functions 1st Gen region](https://firebase.google.com/docs/functions/locations).

Not required if `FB_FUNCTIONS_REGION` is a v1-supported region.

#### `FB_FUNCTIONS_MEMORY`,
#### `FB_FUNCTIONS_TIMEOUT`,
#### `FB_FUNCTIONS_MAX_INSTANCES`,
#### `FB_FUNCTIONS_MIN_INSTANCES`,
#### `FB_FUNCTIONS_CPU`,
#### `FB_FUNCTIONS_CONCURRENCY`

See the [Cloud Functions documentation](https://firebase.google.com/docs/functions/manage-functions).

These values are global and affect all Cloud Functions. Alternatively, you can set these values at the per-function level. Per-function level settings override global settings.

:::warning
Setting `FB_FUNCTIONS_MIN_INSTANCES` to a value greater than 0 WILL result in a fee (charged by Google Cloud).
:::

#### `FB_FUNCTIONS_CONSUME_APP_CHECK_TOKEN`

Whether or not to enable [replay protection](https://firebase.google.com/docs/app-check/cloud-functions#replay-protection) for Cloud Functions.

Must be set to `true` or `false`.

Defaults to `false`.

### Firebase Hosting Config

You Admin UI is hosted on Firebase Hosting.

#### `FB_HOSTING_ENABLE_CLOUD_LOGGING`

Whether or not to export hosting logs to [Cloud Logging](https://cloud.google.com/logging/docs).

Must be set to `true` or `false`.

Defaults to `false`.

#### `FB_HOSTING_MAX_VERSIONS`

The number of previous site versions to store in Firebase Hosting. 

### App Check Config

You can optionally protect your app with an additional layer of security using [Firebase App Check](https://firebase.google.com/docs/app-check).

This is highly recommended.

#### `FB_ENABLE_APP_CHECK`

Must be set to `true` or `false`.

Defaults to `false`.

#### `FB_APP_CHECK_TOKEN_TTL`

How often Firebase App Check tokens will be refreshed on the client.

In some cases token refresh may fail. In this case we provide [a hook to manage failure scenarios](/docs/api-reference/Global%20Config%20File#onappchecktokenfailure). The default value for this hook shows a message to the user asking them to refresh the page, which resolves the issue.

Defaults to `"3600s"` / 1 hour.

### AI / Genkit Config

Stoker apps have an optional chat bot feature, which allows users to discuss their app data with an LLM (using RAG).

This feature is powered by Firebase Genkit.

#### `FB_AI_REGION`

The region for the AI service. We recommend using `"us-central1"` or `"us-west1"` at this stage.

Defaults to `"us-central1"`.

### Mail Config (Required)

The email account used to send email out of the system.

#### `MAIL_REGION`

A Google Cloud region supported by [Eventarc](https://docs.cloud.google.com/eventarc/docs/locations)

#### `MAIL_SENDER`

i.e. `Stoker Platform <username@gmail.com>`

#### `MAIL_SMTP_CONNECTION_URI`

i.e. `smtps://username@gmail.com@smtp.gmail.com:465`

#### `MAIL_SMTP_PASSWORD`

i.e. a Gmail app password

### SMS Config

The [Twilio](https://www.twilio.com/en-us) account used to send SMS out of the system.

You'll need to sign up for a Twilio account and set up a phone number.

#### `TWILIO_ACCOUNT_SID`,
#### `TWILIO_AUTH_TOKEN`,
#### `TWILIO_PHONE_NUMBER`: Must start with a + and an international code.

### Algolia Config

Stoker uses Algolia for full text search in collections with large volumes of data. For collections with small amounts of data, client side full text search is used by default and Algolia is not required.

#### `ALGOLIA_ID`,
#### `ALGOLIA_ADMIN_KEY`

### Sentry Config

#### `SENTRY_DSN`

Provide a Sentry DSN to enable Sentry on your web app (for all projects).

### `FULLCALENDAR_KEY`

Provide a license key for [Fullcalendar](https://fullcalendar.io) if you will enable the [Calendar](/docs/api-reference/Collection%20Config%20Files#calendar) view.

### `EXTERNAL_SECRETS`

You can provide a key-value list of secrets that for use in your custom Cloud Functions and [hooks](/docs/api-reference/Collection%20Config%20Files#collection-hooks). These secrets will be uploaded to [Google Cloud Secret Manager](https://cloud.google.com/security/products/secret-manager?hl=en).

If you want to use secrets in you Node [hooks](/docs/api-reference/Collection%20Config%20Files#collection-hooks), add them to `EXTERNAL_SECRETS` and the Write API function, for example:

```
const xeroId = defineSecret("XERO_ID");
const xeroSecret = defineSecret("XERO_SECRET");

stoker["writeapi"] = onCall({
    cors: true,
    consumeAppCheckToken,
    minInstances,
    secrets: [xeroId, xeroSecret],
}, (request) => {
    return writeApi(
        request,
        {xeroId, xeroSecret},
    );
});
```
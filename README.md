<img width="500" src="https://storage.googleapis.com/stoker-assets/Stoker%20Logo.png" />

## Build realtime, offline-ready internal tools.<br></br>Optionally ship them as highly scalable, multi-tenant SaaS products.<br></br>

[Visit Website](https://stoker-website.web.app)

Stoker is in alpha mode.

We're currently offering free support (subject to availability). Get in touch at info@getoutpost.com and we'll add you to our private Slack support channel.

You'll need to purchase a commercial license to use Stoker in production. That said, feel free to try it out during development to see if it's a good fit for your needs. Please see the included license for full details.

You don't need to sign up to use Stoker at this stage, but you may need to in future.

[Read the docs](https://stoker-website.web.app/docs/Getting%20Started)

## The Basics

These steps are detailed below.

1. Install Stoker and the required tools
2. Fill out a simple .env file that describes your back-end infrastructure (for example, hosting regions).
3. Fill out your global config file (project-wide config)
4. Create a schema file for each "collection" required in your app. Defaults are provided for Users, Settings, Inbox and Outbox.
5. Set up your development and production environments
6. Add tenants to your app using `stoker add-tenant` (one tenant for each organization that will use your app)
7. Hit `stoker deploy` to deploy changes

> [!NOTE]
> The cost of running your development environment on Google Cloud Platform will be around **USD$1 per month**.

## Installation

Prerequisites:

- Google Account (must have a [Google Cloud billing account](https://docs.cloud.google.com/billing/docs/how-to/create-billing-account))
- Node JS 22+
- Firebase CLI:
    - `npm i -g firebase-tools`
    - `firebase login`
- Google Cloud CLI:
    - Prerequisites:
        - Python 3.13
        - [Java](https://www.oracle.com/au/java/technologies/downloads/)
    - Installation:
        - [Install](https://docs.cloud.google.com/sdk/docs/install)
        - `gcloud init`
        - `gcloud auth application-default login`
- Genkit CLI:
    - `npm i -g genkit-cli`

Stoker:

- `npm i -g @stoker-platform/cli`
- Create a new directory i.e. "my-app" and open it in your IDE
- `stoker init && git init && npm i && npm --prefix functions i`

You might also want to update your package name in package.json.

## Back End Setup

The back end config for your app is found at `.env/.env` in your project directory.

You can use the defaults to get started, but you MUST provide:

- General:
    - `ADMIN_EMAIL`: The email address to be used for system notifications
    - `ADMIN_SMS`: The phone number to be used for system notifications
    - `GCP_BILLING_ACCOUNT`: [Google Cloud Billing Account ID](https://docs.cloud.google.com/billing/docs/how-to/find-billing-account-id)

- Mail (used to send email out of the system):
    - `MAIL_REGION`: A Google Cloud region supported by [Eventarc](https://docs.cloud.google.com/eventarc/docs/locations)
    - `MAIL_SENDER`: i.e. `Stoker Platform <username@gmail.com>`
    - `MAIL_SMTP_CONNECTION_URI`: i.e. `smtps://username@gmail.com@smtp.gmail.com:465`
    - `MAIL_SMTP_PASSWORD`: i.e. a Gmail app password

Recommended but not required:

- Google Analytics Account ID
- Sentry DSN
- Algolia credentials. Used for full text search in collections with large volumes of data. For collections with small amounts of data, client side full text search is used by default.
- Twilio credentials (used to send SMS out of the system):
    - `TWILIO_ACCOUNT_SID`
    - `TWILIO_AUTH_TOKEN`
    - `TWILIO_PHONE_NUMBER`: Must start with a + and an international code.

For more information, see [Env Files - Back End Setup](https://stoker-website.web.app/docs/api-reference/Env%20Files-%20Back%20End%20Setup).

## Icons

- You can use the default icons to get started.
- Replace logo-small.png and logo-large.png in the icons directory with your own icons (keep the same file names).
- Recommended sizes are 192 x 192 (logo-small) and 3000 x 3000 (logo-large).

## Global Config File

Your app's global config file is found at `src/main.ts`.

We recommend using the defaults to get started, but you MUST provide:

- [roles](https://stoker-website.web.app/docs/api-reference/Global%20Config%20File#roles): This is the big one. Name the access roles that will be used in your app. Each role will have its own permissions.
- [appName](https://stoker-website.web.app/docs/api-reference/Global%20Config%20File#appname): The name of your app. Shorter is better, as this will be used for page titles etc.
- [timezone](https://stoker-website.web.app/docs/api-reference/Global%20Config%20File#timezone): Your app will be based in this timezone. Must be a valid IANA timezone.

For more information, see [Global Config File](https://stoker-website.web.app/docs/api-reference/Global%20Config%20File).

## Collection Files


Collection files are found at `src/collections`

The default collections are enough to get started.

> [!IMPORTANT]
> If you are not using the default roles "Admin" and "User", you will need to:
>
> - Go into each default collection file
> - Change all references to "Admin" and "User" to the roles you provided.

The most important concepts to know are:

- Views: [List](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#list), [Board](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#cards), [Images](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#images), [Map](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#map) & [Calendar](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#calendar)
- [Access control policies](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#access-control-policies) and [field-level access restrictions](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#access)
- [Preload Cache](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#preload-cache-config)
- Relational Fields:
    - [Include Fields](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#includefields) and [Title Field](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#titlefield)
    - [Dependency Fields](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files#dependencyfields)

> [!TIP]
> Stoker is available in [Context7](https://context7.com/outpost-software/stoker) as "Stoker Platform".

For more information, see [Collection Config Files](https://stoker-website.web.app/docs/api-reference/Collection%20Config%20Files).

## Development Environment

> [!NOTE]
> Development project deployment takes around **20 minutes**- there's quite a lot of infrastructure to deploy. No input is required from you until the very last, so you can let deployment run in the background.

> [!IMPORTANT]
> If you have not already used Firebase in your Google Cloud account, you'll have to [manually create a Firebase project](https://console.firebase.google.com) in your account before continuing. This is currently the only way you can accept the Firebase terms and conditions, which is required to continue. You can delete your manually created project when you are done- it won't be required for Stoker.

1. Add a development project using `stoker add-project -n <PROJECT_NAME> --development`. You'll be prompted to add the first tenant to your project (requires an organization name and a user). If your deployment is stopped for any reason, you can re-run the `add-project` command to resume. It's normal to see some error messages in the terminal output during deployment.
2. Navigate to the project by running `export GCP_PROJECT=<PROJECT_NAME> && stoker set-project`
3. Run `stoker emulator-data`
4. `npm run start`
5. Navigate to `localhost:4001` and add the password for your test user in the Authentication section (each time you run `npm run start`).
6. Navigate to `localhost:5173` to see your app. All data will be reset each time you run `npm run start`.
7. If you are using App Check, set up your App Check debug token (steps 2 & 3 [here](https://firebase.google.com/docs/app-check/web/debug-provider#localhost))

When you make changes to your app schema, you may need to close your terminal session and re-run `npm run start`.

You may need to clear the required ports on your system before re-running `npm run start`.

## Production Environment

You can add production projects to your app using `stoker add-project -n <PROJECT_NAME>`

You can add tenants to a production project using `stoker add-tenant`

You can view the app for a project at `https://<PROJECT_NAME>.web.app`

Add a custom domain using [`stoker custom-domain`](https://stoker-website.web.app/docs/api-reference/CLI#custom-domain-options).

We recommend setting up notifications in [Error Reporting](https://console.cloud.google.com/errors) for each production project in the Google Cloud console. That way you'll get emailed whenever your back end services throw an error.

## Deployment

To deploy your latest changes to a project:

- Navigate to the project by running `export GCP_PROJECT=<PROJECT_NAME> && stoker set-project`
- `stoker deploy`

## Privacy Notice

> [!IMPORTANT]
> All of your app data is stored in your own Google Cloud projects. We do NOT have access to your Google Cloud projects or your app data.
>
> When you deploy with `stoker deploy` or add a project with `stoker add-project`, the following occurs:
>
> - Your Stoker schema (JSON) is sent to our server.
> - Our server returns Firestore Indexes, Firestore Security Rules and Firebase Storage Security Rules for your project.
> - We do not store, log, or retain your schema, generated rules, or index definitions after the request is completed. They are processed in-memory solely for the purpose of generating the required Firebase configuration files.
> - No AI is used in the generation of your rules / indexes.
>
> No analytics or tracking data are collected from the Stoker CLI.
>
> This is a summary provided for convenience. For legal definitions, please review our full Privacy Policy.

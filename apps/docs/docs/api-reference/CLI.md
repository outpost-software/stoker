---
sidebar_position: 9
---

Stoker provides a CLI for working with your app.

This page provides an overview of the available CLI commands.

For details on the options for each command, run `stoker <COMMAND> --help`

## Project Commands

These commands are covered in the [Getting Started](/docs/Getting%20Started) guide.

### `init [options]`
  
Bootstrap a new Stoker project

### `set-project`
  
Select a project to work with. Must be used in conjunction with `export GCP_PROJECT="<PROJECT_NAME>"`

### `emulator-data`                 
  
Copy live app data into the Firebase Emulator Suite

### `start [options]`                

Start the Firebase Emulator Suite

### `start-web-app`

Start the web app Firebase Emulator Suite

### `build-web-app`

Build the web app

### `apply` 

Apply schema to local environment

### `add-project [options]`

Add a Google Cloud project

### `delete-project [options]`

Delete a Google Cloud project. Be careful!

### `add-tenant`

Add a tenant to a project

### `delete-tenant [options]`

Delete a tenant from a project. Be careful!

## Custom Domain

### `custom-domain [options]`         

Set a custom domain for the project

:::tip
We recommend enabling DNSSEC and HSTS preload for your domain. These security features are configured outside of Stoker.
:::

## Data Commands

### `export`                          

Export Firestore data to Cloud Storage

### `bigquery` [options]

Export a Firestore collection to BigQuery

### `seed-data` [options]

Seed test data

## CRUD Commands

### `add-record [options]`

Add a record

### `add-record-prompt [options]`  

Add a record to a collection using terminal prompts

### `update-record [options]`

Update a record

You only need to provide the fields that you want to update

To delete a field, set the field value to `"_DELETE_FIELD"`

### `delete-record [options]`

Delete a record

### `get-one [options]`

Get a record

### `get-some [options]`

Get multiple records

## Audit Commands

### `audit-permissions [options]`

Detect non-default permissions for roles

### `audit-denormalized [options]`

Audit denormalized data integrity

### `audit-relations [options]`

Audit relations data integrity

### `explain-preload [options]`

Explain / analyze preload cache queries

## Google Cloud / Firebase Commands

### `list-projects`

List Google Cloud projects

### `set-user-role [options]`

Set the "role" custom claim for a user

### `set-user-collection [options]`

Set the "collection" custom claim for a user

### `set-user-document [options]`

Set the "doc" custom claim for a user

### `get-user [options]`

Retrieve a Firebase user

### `get-user-record [options]`

Retrieve a Firestore user record

### `get-user-permissions [options]`

Retrieve a Firestore user permissions record

## Deployment Commands

These commands are run automatically when needed as part of `stoker deploy`.

### `lint-schema`

Lint the Stoker schema

### `security-report`

Run the security report

### `deployment [options]`

Toggle deployment status

### `maintenance [options]`

Toggle maintenance mode

### `live-update [options]`

Trigger a live update

### `persist-schema`

Persist schema to Firebase

### `deploy-ttls`

Deploy Firestore TTLs

### `generate-firestore-indexes`

Generate Firestore indexes

### `generate-firestore-rules`

Generate Firestore security rules

### `generate-storage-rules`

Generate Cloud Storage security rules

### `migrate`                      

Migrate the database

### `deploy [options]`

Deploy project
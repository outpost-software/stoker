---
sidebar_position: 5
---

## Install Custom NPM Packages

You can add npm packages to your app using `external.package.json`. Client-side packages should go in the `web` object, and server-side packages should go in the `node` object. Use the same syntax as package.json `dependencies`.

## Custom Cloud Functions

You can add custom [Cloud Functions](https://firebase.google.com/docs/functions) in `functions/src/index.ts`.

Use this to add custom server operations to your app.

## Custom Firebase Extensions

In addition to Cloud Functions above, you can add [Firebase Extensions](https://firebase.google.com/products/extensions) to extend your app's server functionality.

## Tests

You can write tests for your app in the `tests` direcory. Tests are powered by [Vitest](https://vitest.dev/).

## AI Prompt Customization

You can customize the system prompt used for your app's AI chat at `functions/prompts/chat.prompt`.

## Custom Firestore Security Rules

You can add custom [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started) in `firebase-rules/firestore.custom.rules`.

## Custom Firestore Indexes

You can add custom Firestore indexes in `firebase-rules/firestore.custom.indexes.json`.

## Run Data Operations

You can use the `ops.js` file to run back-end operations on your data.

## Remote Config

You can configure [Firebase Remote Config](https://firebase.google.com/docs/remote-config) using `remoteconfig.template.json`.

## Modify Admin UI Headers

You can edit the headers (including CSP) for the Admin UI app in `firebase.hosting.json`.

## Migration Logs

A record of migration operations for schema updates can be found in the `.migration` directory.

## Cloud IDE

You can use [GitHub Codespaces](https://github.com/features/codespaces) to develop your app.

Config is found in the `.devcontainer` directory.
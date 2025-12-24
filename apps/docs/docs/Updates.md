---
sidebar_position: 2
---

This section covers keeping your Stoker project up to date.

## Stoker Project

The current recommended way to update to the latest version of the Stoker platform:
- Delete the `node_modules` directory from both your root directory and your functions directory
- Delete `package-lock.json` from both your root directory and your functions directory
- Run `npm update --save && npm --prefix functions update --save`

## Stoker CLI

We recommend periodically running `npm i -g @stoker-platform/cli` to keep your Stoker CLI up to date.

## gcloud CLI

We recommend periodically running `gcloud components update` to keep your Google Cloud CLI up to date.

## Firebase CLI

We recommend periodically running `npm i -g firebase-tools` to keep your Firebase CLI up to date.

## Genkit CLI

We recommend periodically running `npm i -g genkit` to keep your Genkit CLI up to date.


## Firebase Extensions

We recommend periodically checking for new versions of the Firebase Extensions listed in firebase.json and updating the version numbers there.
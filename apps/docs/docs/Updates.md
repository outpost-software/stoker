---
sidebar_position: 2
---

This section covers keeping your Stoker project up to date.

## Stoker Project

The current recommended way to update to the latest version of the Stoker platform:

1. Delete the `node_modules` directory from both your root directory and your functions directory
2. Delete `package-lock.json` from both your root directory and your functions directory
3. Run `npm update --save && npm --prefix functions update --save`

## Tooling

We recommend running the following commands periodically in order to keep your tooling up to date:

| Tool | Recommended update command |
| --- | --- |
| Stoker CLI | `npm i -g @stoker-platform/cli` |
| Google Cloud CLI | `gcloud components update` |
| Firebase CLI | `npm i -g firebase-tools` |
| Genkit CLI | `npm i -g genkit` |

## Firebase Extensions

We recommend periodically checking for new versions of the Firebase Extensions listed in `firebase.json` and updating the version numbers there.
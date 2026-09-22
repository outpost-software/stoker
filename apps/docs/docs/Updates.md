---
sidebar_position: 2
---

This section covers keeping your Stoker project up to date.

## Stoker Project
Run `npm update && npm --prefix functions update` in your project directory to update your project's dependencies (including the Stoker Platform).

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
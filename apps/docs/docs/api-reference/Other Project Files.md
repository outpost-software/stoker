---
sidebar_position: 5
---

| File or Area | Purpose |
| --- | --- |
| `external.package.json` | Add npm packages to your app. Client-side packages should go in the `web` object, and server-side packages should go in the `node` object. Use the same syntax as package.json `dependencies`. |
| `functions/src/index.ts` | Add custom [Cloud Functions](https://firebase.google.com/docs/functions). Use this to add custom server operations to your app. |
| Firebase Extensions | In addition to Cloud Functions above, you can add [Firebase Extensions](https://firebase.google.com/products/extensions) to extend your app's server functionality. |
| `tests` | Write tests for your app. Tests are powered by [Vitest](https://vitest.dev/). |
| `functions/prompts/chat.prompt` | Customize the system prompt used for your app's AI chat. |
| `firebase-rules/firestore.custom.rules` | Add custom [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started). |
| `firebase-rules/firestore.custom.indexes.json` | Add custom Firestore indexes. |
| `ops.js` | Run back-end operations on your data. |
| `remoteconfig.template.json` | Configure [Firebase Remote Config](https://firebase.google.com/docs/remote-config). |
| `firebase.hosting.json` | Edit the headers, including CSP, for the Admin UI app. |
| `.migration` | Review the record of migration operations for schema updates. |
| `.devcontainer` | Configure [GitHub Codespaces](https://github.com/features/codespaces) for cloud development. |
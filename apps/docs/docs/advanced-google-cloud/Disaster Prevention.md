---
sidebar_position: 1
---

## Budget Alerts

We recommend setting [Budget Alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets) to prevent unexpected Google Cloud bills.

## Liens

You can prevent accidental or malicious deletion of a Google Cloud project by placing a [Lien](https://docs.cloud.google.com/resource-manager/docs/project-liens) on the project.

## Realtime Database Backups

Your Stoker app data is stored in Cloud Firestore, and disaster prevention is managed via the options in your `.env/.env` file.

However, your schema history is stored separately in the Firebase Realtime Database. We recommend setting up backups for that service in the [Firebase Console](https://console.firebase.google.com/project/_/database/backups?_gl=1*kzeeyy*_ga*MjExMzY4MjQwMi4xNzY0Mjk3NzM5*_ga_CW55HF8NVT*czE3NjQzMjIwMjMkbzIkZzEkdDE3NjQzMjIwNDIkajQxJGwwJGgw).

## Firebase Console Production Label

You can add a Production label to your production projects in the Firebase Console to ensure they are not confused with development projects. The option is in "Project Settings" in the Firebase Console.
---
sidebar_position: 5
---

These are current limitations of the Stoker Platform.

## Google Cloud / Firebase limitations

Stoker is subject to the [limitations of Cloud Firestore](https://firebase.google.com/docs/firestore/quotas). However, we have built Stoker in a way that avoids many of these limitations. Additionally, we often warn you when limits are being approached or have been exceeded. It's our goal to provide you with the insights you need so that you don't hit unexpected limits.

## Data migrations require downtime

Currently, if you need to migrate a projects's data, you'll need to put that project into maintenance mode. In future we may add support for zero-downtime migrations.

You'll have to write code for data migrations yourself at this stage.

## Write rate limitations

#### No support for high document write rates

In Cloud Firestore, you can't update a single document at an unlimited rate. Firestore offers a solution using ["Distributed Counters"](https://firebase.google.com/docs/firestore/solutions/counters), but we haven't implemented that solution into Stoker at this stage.

#### No support for high collection write rates for collections with sequential indexed values

If a Firestore collection contains documents with sequential indexed values, Cloud Firestore limits the write rate to 500 writes per second. Firestore offers a solution using ["Sharded Timestamps"](https://firebase.google.com/docs/firestore/solutions/shard-timestamp), but we haven't implemented that solution into Stoker at this stage.
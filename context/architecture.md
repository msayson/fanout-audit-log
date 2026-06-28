# Architecture

Reference implementation of an append-only audit log for fan-out workflows on AWS. Demonstrates immutable event storage, a rebuildable current-state projection, and operational dashboards.

**In scope:** audit event log, current-state projection, dashboards, CDK infrastructure.  
**Out of scope:** fan-out dispatch layer, work-item execution, redriveable queues.

Detailed design lives in `docs/design/`. Decisions are recorded in `docs/decisions/`.

## Components

| Component | Role |
|---|---|
| Worker | Executes a work item; emits one structured event per outcome to Firehose |
| Amazon Data Firehose | Buffers events, converts to Parquet, writes partitioned objects to S3 |
| S3 Audit Bucket | Append-only, WORM (Object Lock), SSE-KMS, Parquet, partitioned by date — the source of truth |
| Glue Table | Partition-projection metadata; no crawler |
| Amazon Athena | Ad-hoc and audit queries directly over S3 Parquet |
| Hourly Glue/dbt Job | Incremental MERGE of the audit log into the current-state table |
| S3 Current-State Table (Iceberg) | One row per `(batch_id, item_id)`, latest-event-wins; 3-month rolling window |
| Per-Work-Item Rollups | Pre-aggregated failure counts and SLA buckets derived by the hourly job |
| QuickSight + SPICE | Completion-health dashboards backed by the rollups |

## Data flow

```
Worker → Firehose → S3 (audit log, P0)
                         │
                         └─ hourly job → Iceberg current-state (P1)
                                              ├─ rollups → QuickSight/SPICE
                                              └─ Athena (drill-down)
```

## Priority tiers

- **P0 — Audit log:** append-only S3 + Athena. Source of truth. Must survive region loss (cross-region replication).
- **P1 — Status projection:** Iceberg current-state + rollups. Rebuildable by replaying the log. Can be deferred or recovered without data loss.

## Key constraints

- Worker has a **single write path**: one Firehose `PutRecord` per event. No second write path to keep consistent.
- Delivery is **at-least-once**. Consumers must deduplicate on `event_id`.
- The P1 projection tolerates **hourly staleness**. It does not serve sub-second live reads (see `docs/decisions/` for DynamoDB/Aurora alternatives).
- Encryption: SSE-KMS with a customer-managed key + S3 Bucket Keys.

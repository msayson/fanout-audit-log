# Glossary

Canonical definitions for this project. Use these terms consistently in code, comments, and documents.

| Term | Definition |
|---|---|
| **Batch** | A parent unit of work that fans out into one or more independently-tracked work items. |
| **Work item** | The smallest independently-tracked action belonging to a batch. The tracker is agnostic to what the work item does — it tracks lifecycle only. |
| **Audit event** | A single structured record emitted by a worker to Firehose describing one occurrence in a work item's lifecycle. The raw, immutable unit of the audit log. |
| **Audit log** | The append-only, WORM S3 store of all audit events. The source of truth for the system. Classified P0. |
| **Current-state table** | The Iceberg S3 table holding one row per `(batch_id, item_id)` — the latest known state of every work item. A rebuildable projection of the audit log. Classified P1. |
| **Projection** | Any derived view computed from the audit log. Rebuildable by replaying the log. Classified P1. |
| **Rollup** | A pre-aggregated summary derived by the hourly job (e.g. failure counts per `item_id`, SLA-breach counts). Stored alongside the current-state table; consumed by QuickSight/SPICE. |
| **P0** | A component whose loss constitutes data loss. The audit log is the only P0 component. |
| **P1** | A component that is a rebuildable projection of P0 data. Can be deferred or recovered without data loss. |
| **Latest-wins** | The MERGE strategy used when building the current-state table: for a given `(batch_id, item_id)` key, the row with the greatest `event_time` wins. |
| **event_id** | A UUID that uniquely identifies one audit event. The deduplication key for at-least-once delivery. |
| **WORM** | Write Once Read Many. Enforced on the audit bucket via S3 Object Lock (GOVERNANCE mode). |
| **SLA** | A configured deadline from `enqueued_at` by which a work item is expected to have a terminal status. Configured per deployment. |

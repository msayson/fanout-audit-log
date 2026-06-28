# Design: Status Projection (P1)

**Status:** approved
**Requirements:** [req-status-projection.md](../requirements/req-status-projection.md)
**Key ADRs:** [decisions-0002-p1-serving-store.md](../decisions/adr-0002-p1-serving-store.md)
**Tasks:** [tasks-status-projection-p1.md](../tasks/tasks-status-projection-p1.md)

---

For the full technical design including cost model, MERGE strategy, and rollup schema, see [`technical-design.md`](technical-design.md).

## Summary

An hourly Glue/dbt job reads new audit-log partitions and MERGEs them into an Iceberg current-state table keyed on `(batch_id, item_id)`, keeping the row with the latest `event_time`. The same job produces per-work-item rollups (failure counts, SLA-breach buckets). QuickSight/SPICE serves dashboards from the rollups; Athena serves drill-down from the current-state table.

**Classification:** P1 — rebuildable projection of the audit log. No independent backup required.
**Freshness:** hourly (not suitable for sub-second live reads).
**Retention:** 3-month rolling window (configurable).
**Rebuild path:** CTAS replay of the full audit log.

## Satisfies

| Requirement | How |
|---|---|
| REQ-SP-01 | Iceberg table, one row per `(batch_id, item_id)`, latest-wins MERGE |
| REQ-SP-02 | No backup; rebuild is CTAS from audit log |
| REQ-SP-03 | Hourly Glue/dbt job with success alarm |
| REQ-SP-04 | QuickSight dashboards over pre-aggregated rollups |
| REQ-SP-05 | `WHERE status NOT IN ('SUCCEEDED','FAILED','SKIPPED') AND now() - enqueued_at > :sla` |
| REQ-SP-06 | `last_successful_run` watermark surfaced in every dashboard |
| REQ-SP-07 | Iceberg snapshot/partition expiry at configured window |

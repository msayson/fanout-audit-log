# Tasks: Status Projection P1

**Status:** not started — do not begin until all Group 5 tasks in [tasks-audit-log-p0.md](tasks-audit-log-p0.md) are complete.  
**Design:** [design-status-projection.md](../design/design-status-projection.md)  
**Requirements:** [req-status-projection.md](../requirements/req-status-projection.md)

---

## Group 1 — Storage

- [ ] **SP-01** CDK: S3 prefix / Iceberg table location for current-state data (reuses audit bucket CMK)
- [ ] **SP-02** CDK: Iceberg table definition (Glue catalog) keyed on `(batch_id, item_id)`
- [ ] **SP-03** CDK: Snapshot/partition expiry configured to rolling retention window (CDK context)

## Group 2 — Transform

- [ ] **SP-04** dbt/Glue job: incremental MERGE of audit log into current-state table (latest-wins on `event_time`)
- [ ] **SP-05** dbt/Glue job: per-work-item rollup models (failure counts, SLA-breach buckets)
- [ ] **SP-06** CDK: EventBridge rule triggering the job hourly
- [ ] **SP-07** Job writes `last_successful_run` timestamp to a known location (e.g. S3 object or SSM parameter)

## Group 3 — Serving

- [ ] **SP-08** Athena named queries: current state by `batch_id`; all failed items; items past SLA
- [ ] **SP-09** QuickSight dataset sourced from per-work-item rollups via SPICE
- [ ] **SP-10** QuickSight dashboard: completion health (failure counts, SLA-breach count, batch summary)
- [ ] **SP-11** Dashboard displays "data as of `<last_successful_run>`" watermark

## Group 4 — Observability

- [ ] **SP-12** CloudWatch alarm: hourly job did not succeed within 90 minutes
- [ ] **SP-13** CloudWatch alarm: `last_successful_run` age > 90 minutes (freshness SLA)

## Group 5 — Validation

- [ ] **SP-14** Rebuild test: drop current-state table, replay audit log via CTAS, verify row counts match
- [ ] **SP-15** Deduplication test: inject duplicate events (same `event_id`), verify current-state table has one row per `(batch_id, item_id)`

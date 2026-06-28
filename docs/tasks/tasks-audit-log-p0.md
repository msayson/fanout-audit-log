# Tasks: Audit Log P0

**Status:** not started  
**Design:** [design-audit-log.md](../design/design-audit-log.md)  
**Requirements:** [req-audit-log.md](../requirements/req-audit-log.md)

Tasks are ordered by dependency. Complete each group before starting the next.

---

## Group 1 — Storage foundation

- [ ] **AL-01** CDK: S3 audit bucket with SSE-KMS (customer-managed key), S3 Bucket Keys enabled, versioning enabled, Object Lock (GOVERNANCE mode, duration from CDK context)
- [ ] **AL-02** CDK: S3 error prefix on the audit bucket for Firehose delivery failures
- [ ] **AL-03** CDK: Cross-region replication rule (audit bucket → replica bucket, replica carries its own Object Lock)
- [ ] **AL-04** CDK: S3 lifecycle rule (expiry ≥ Object Lock duration, set from same CDK context value)

## Group 2 — Ingest

- [ ] **AL-05** CDK: Firehose delivery stream (direct put, Parquet conversion via Glue schema, buffer 128 MB / 300 s, error prefix → AL-02)
- [ ] **AL-06** CDK: Glue schema for the audit event record (matches schema in `docs/design/technical-design.md §3`)
- [ ] **AL-07** Worker helper: `PutRecord` wrapper with exponential backoff and terminal failure classification

## Group 3 — Query

- [ ] **AL-08** CDK: Glue table with partition projection (`dt=YYYY/MM/DD`), no crawler
- [ ] **AL-09** CDK: Athena workgroup (output bucket, per-query data-scanned alarm)
- [ ] **AL-10** Named Athena queries: events by `batch_id`, events by `item_id`, events by `tenant_id` in date range

## Group 4 — Observability

- [ ] **AL-11** CloudWatch alarm: Firehose error-prefix object count > 0
- [ ] **AL-12** CloudWatch alarm: Firehose `DeliveryToS3.Success` rate drop
- [ ] **AL-13** CDK: KMS key rotation enabled; CloudTrail logging for decrypt API calls

## Group 5 — Validation

- [ ] **AL-14** Example events: at least one event per status value (`PENDING`, `SUCCEEDED`, `FAILED`, `SKIPPED`)
- [ ] **AL-15** Integration smoke test: emit events via helper → wait for Firehose flush → Athena query returns expected rows (deduplicated on `event_id`)

# Design: Audit Log (P0)

**Status:** approved
**Requirements:** [req-audit-log.md](../requirements/req-audit-log.md)
**Key ADRs:** [adr-0001-firehose-over-lambda.md](../decisions/adr-0001-firehose-over-lambda.md), [adr-0002-p1-serving-store.md](../decisions/adr-0002-p1-serving-store.md), [adr-0003-lambda-kotlin-worker.md](../decisions/adr-0003-lambda-kotlin-worker.md)
**Tasks:** [tasks-audit-log-p0.md](../tasks/tasks-audit-log-p0.md)

---

For the full technical design including schema, cost model, Firehose configuration, and retention rules, see [`technical-design.md`](technical-design.md).

This file is the navigational entry point for the P0 audit log. It exists to make the traceability chain explicit.

## Summary

The audit log is the system of record. The worker — a **Kotlin Lambda function** — executes fan-out work items and emits one structured event per occurrence directly to Amazon Data Firehose. Firehose buffers, converts to Parquet, and writes date-partitioned objects to S3 (Object Lock, SSE-KMS). Athena queries the log via a Glue table with partition projection.

**Worker runtime:** AWS Lambda, Kotlin on the Java runtime, ARM64 (Graviton), SnapStart enabled. See ADR-0003.
**Source of truth:** S3 audit bucket.
**Query engine:** Athena.
**Ingest:** Firehose direct put (no streaming bus).
**Immutability:** S3 Object Lock (GOVERNANCE mode).
**Deduplication key:** `event_id`.

## Audit event schema

See `docs/design/technical-design.md §3` for the full Parquet schema.

Core fields: `event_id`, `event_time`, `enqueued_at`, `tenant_id`, `batch_id`, `work_type`, `item_id`, `item_type`, `status`, `skip_reason`, `error_code`, `error_reason`.

## Satisfies

| Requirement | How |
|---|---|
| REQ-AL-01 | Append-only S3 with Object Lock |
| REQ-AL-02 | Athena + partition projection; date-pruned scans |
| REQ-AL-03 | Cross-region S3 replication; P1 rebuilt from log |
| REQ-AL-04 | Firehose buffering; columnar Parquet; no per-event Lambda |
| REQ-AL-05 | SSE-KMS with customer-managed key + Bucket Keys |
| REQ-AL-06 | At-least-once Firehose; `event_id` deduplication key |
| REQ-AL-07 | S3 lifecycle rule, Object Lock duration = retention config |

# Requirements: Audit Log

**Status:** approved  
**Design:** [design-audit-log.md](../design/design-audit-log.md)

---

## REQ-AL-01 — Append-only event log

The system shall record one structured event per work-item lifecycle occurrence in an append-only, immutable store.

No event may be modified or deleted within the configured retention period.

## REQ-AL-02 — Queryable audit history

The audit log shall be queryable by `batch_id`, `item_id`, and `tenant_id` to support verification and compliance audits.

Queries must be possible without full-table scans.

## REQ-AL-03 — Durability and disaster recovery

The audit log shall survive a single AWS region loss.

RPO is bounded by replication lag. A recovery path (log replay in the recovery region) must exist for the P1 projection.

## REQ-AL-04 — Scale-linear cost

The architecture shall support the full scale envelope (10 batches/month to 10,000 batches/day, up to 10,000 items/batch) without architectural change.

Cost must scale linearly with event volume.

## REQ-AL-05 — Encryption at rest

All audit data shall be encrypted using a customer-managed KMS key.

## REQ-AL-06 — At-least-once delivery with idempotent consumers

The ingest path may deliver duplicate events. Consumers must be able to deduplicate on `event_id`.

## REQ-AL-07 — Configurable retention

Retention duration shall be configurable per deployment. Default: 3 years for the audit log.

The WORM lock duration must match or be less than the lifecycle expiry to permit deletion after retention expires.

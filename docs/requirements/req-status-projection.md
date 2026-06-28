# Requirements: Status Projection

**Status:** approved  
**Design:** [design-status-projection.md](../design/design-status-projection.md)  
**Depends on:** [req-audit-log.md](req-audit-log.md)

---

## REQ-SP-01 — Current-state view

The system shall maintain a current-state view of every work item (one row per `batch_id × item_id`) derived from the audit log.

## REQ-SP-02 — Rebuildable from log

The current-state projection shall be fully rebuildable by replaying the audit log. It has no independent backup requirement.

## REQ-SP-03 — Freshness

The projection shall be refreshed at least hourly under normal operating conditions.

## REQ-SP-04 — Completion-health dashboards

The system shall provide dashboards showing:
- work items ranked by failure count
- batches and items approaching or past SLA
- overall completion status by batch and tenant

## REQ-SP-05 — SLA breach detection

The system shall identify work items where `now() - enqueued_at > SLA` and status is not terminal (`SUCCEEDED`, `FAILED`, or `SKIPPED`). SLA threshold is configurable per deployment.

## REQ-SP-06 — Freshness visibility

Every dashboard must display a "data as of `<last-successful-run>`" watermark. A stalled job must produce visibly stale state rather than silently incorrect data.

## REQ-SP-07 — Retention

The current-state projection shall maintain a rolling window. Default: 3 months. Records outside the window remain in the audit log.

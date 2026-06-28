# ADR-0002: S3 Iceberg current-state table over DynamoDB or Aurora

**Status:** accepted  
**Date:** 2026-06-28  
**Context:** [design-status-projection.md](../design/design-status-projection.md), REQ-SP-01, REQ-SP-03

## Decision

Serve the P1 current-state projection from an S3 Iceberg table (built by an hourly Glue/dbt MERGE job), with QuickSight/SPICE for dashboards and Athena for drill-down.

## Reasoning

All P1 views tolerate hourly staleness. The projection reuses the audit-log pipeline (same S3 bucket, same CMK, same query engine), introduces no new datastore, and keeps the worker to a single write path. Cost at 10k batches/day is ~$80/month versus ~$17k/month for DynamoDB at 3× write amplification.

Access patterns are flexible SQL (`GROUP BY`, range filters, failure-count ranking) rather than fixed key lookups. New dashboard views are SQL changes, not schema migrations or new GSIs.

## Trigger for revisiting

A confirmed requirement for sub-hour, millisecond-latency reads of an individual work item's status. If that need emerges:

1. Add a DynamoDB table for keyed point-lookups (fed from the same log stream). It composes with this decision — B handles aggregates and dashboards; A handles the hot keyed read.
2. Evaluate Aurora Serverless v2 only if ms-latency **and** richly interactive SQL are both required simultaneously.

The audit log remains source of truth in all cases. The serving store can change by replaying the log; there is no migration penalty.

## Alternatives considered

| Option | Cost (6,083M ev/mo) | Freshness | Point-read latency | New datastore? |
|---|---|---|---|---|
| **A — DynamoDB** | ~$17,010/mo | real-time | ms | yes |
| **B — S3 Iceberg (chosen)** | ~$80/mo | hourly | seconds | no |
| **C — Aurora Serverless v2** | ~$8,400/mo | real-time | ms | yes |

Full cost workings in `docs/design/technical-design.md §5, Appendix A`.

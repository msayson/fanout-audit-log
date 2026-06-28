# Roadmap

## Current phase: foundation

The project is in its initial design and scaffolding phase.

### P0 — Audit log (current focus)

- [ ] Finalise audit event schema
- [ ] CDK stack: S3 bucket (Object Lock, SSE-KMS, cross-region replication)
- [ ] CDK stack: Firehose delivery stream (Parquet conversion, error prefix)
- [ ] CDK stack: Glue table with partition projection
- [ ] Worker SDK / helper: `PutRecord` wrapper with retry and failure classification
- [ ] Athena workgroup and named queries for common audit lookups
- [ ] Example events and integration smoke test

### P1 — Status projection (next)

- [ ] Hourly Glue/dbt incremental MERGE job
- [ ] Iceberg current-state table CDK stack
- [ ] Per-work-item rollup models
- [ ] QuickSight dataset and dashboard (completion health, SLA breach)
- [ ] Freshness alarm and "data as of" watermark in dashboards

### Post-MVP (deferred)

- [ ] Parameterise retention durations as CDK context values

## Prioritisation principles

- P0 before P1. The projection is useless without the log.
- No P1 work starts until the P0 audit log is deployed and validated.
- ADRs are written before implementation begins for any decision with meaningful alternatives.

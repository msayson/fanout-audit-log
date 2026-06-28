# ADR-0001: Firehose direct-put over Lambda Parquet writer

**Status:** accepted  
**Date:** 2026-06-28  
**Context:** [design-audit-log.md](../design/design-audit-log.md), REQ-AL-04

## Decision

Use Amazon Data Firehose with built-in Parquet conversion for audit event ingest rather than a hand-rolled Lambda that writes Parquet files per batch.

## Reasoning

Firehose flushes one Parquet object per buffer window (size or interval), producing few large files. A per-invocation Lambda writer would produce one small file per event, causing a small-file problem that explodes both Athena scan costs and S3 PUT costs at high volume. Firehose's managed buffering eliminates that class of problem with no application code.

## Consequences

- Buffer latency: events are not immediately queryable; they land after the buffer interval (default 5 min, configurable).
- Undeliverable records land on an S3 error prefix and are not auto-replayed. The error prefix must be monitored and alarmed.
- A persistent `PutRecord` failure is treated as a work-item failure (worker retries before classifying).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Lambda Parquet writer (per-event) | Small-file / PUT-cost explosion at high volume |
| Kinesis Data Streams → Firehose | Adds cost and ops for no gain; worker is sole writer |

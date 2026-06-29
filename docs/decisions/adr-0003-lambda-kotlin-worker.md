# ADR-0003: Lambda (Kotlin) for worker compute

**Status:** accepted  
**Date:** 2026-06-29  
**Context:** [design-audit-log.md](../design/design-audit-log.md), REQ-AL-04

## Decision

Implement the worker — the component that executes fan-out work items and emits audit events via Firehose `PutRecord` — as an AWS Lambda function written in Kotlin, deployed on **ARM64 (Graviton)** with **SnapStart** enabled.

## Reasoning

**Lambda:**  
Simplest deployment and operational model: no cluster, container, or always-on infrastructure to manage. At fewer than 1 million invocations per month the cost is negligible (Lambda's free tier covers 1M requests and 400,000 GB-seconds of compute per month). The fan-out pattern is a natural fit — each work item maps to a Lambda invocation, which terminates when the item completes and its audit event is emitted. No persistent state or long-running process is required.

**ARM64 (Graviton):**  
ARM64 Lambda compute costs ~20% less than x86_64 ($0.0000133334 vs $0.0000166667 per GB-second) with equivalent or better throughput. Kotlin compiles to standard JVM bytecode and runs identically on ARM64; no code changes are required.

**SnapStart:**  
Lambda SnapStart (available on Java 11+ runtimes, including ARM64) takes a Firecracker memory snapshot after the function initializer completes. Cold starts restore from the snapshot rather than initialising the JVM from scratch, reducing cold-start latency from ~1–3 s to ~200 ms. This removes the primary operational concern with JVM-on-Lambda. SnapStart requires deploying published Lambda versions rather than `$LATEST`.

**Kotlin:**  
Team preference for strongly typed JVM languages. Kotlin reduces boilerplate significantly compared to Java: data classes, null safety, and extension functions eliminate the ceremony around event record construction and serialization; coroutines provide structured concurrency for the retry-with-backoff loop in `putAuditEvent()`. AWS Lambda supports Kotlin natively via the Java runtime.

## Consequences

- SnapStart requires publishing a Lambda version on each deploy; the function alias or event source mapping must point to the published version, not `$LATEST`.
- SnapStart snapshots are invalidated on each new publish, so the first invocation after a deploy incurs a full cold start. Subsequent cold starts within that version restore from the snapshot.
- Retry logic and `PutRecord` backoff must be implemented in the `putAuditEvent()` helper (P0-05); Lambda provides no built-in retry for synchronous SDK calls.
- Lambda's 15-minute execution limit is a non-constraint for work items; any item approaching that bound has other failure modes before audit emit becomes the concern.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| ECS Fargate (container) | Always-on cost; significant ops overhead (task definition, cluster, service); no benefit at < 1M invocations/month |
| Step Functions activity worker | Adds orchestration complexity; fan-out dispatch is out of scope for this design |
| In-process library (no Lambda) | Ties the worker to a specific host service; Lambda makes it independently deployable and testable |
| Java | Kotlin is strictly better on the JVM for this use case: equivalent runtime, less boilerplate |
| TypeScript / Python | Not a strongly typed JVM language; no team preference for weakly typed or non-JVM runtimes here |

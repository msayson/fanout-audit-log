# Tasks: Audit Log P0
**Status:** not started
**Design:** [work-item-lifecycle-tracking-design.md](../design/work-item-lifecycle-tracking-design.md)
**Requirements:** [req-audit-log.md](../requirements/req-audit-log.md)

Scope: **P0 only** — the append-only audit log (ingest, durable storage, query) in a single region. The P1 status projection (hourly job, Iceberg current-state, rollups, dashboards) and cross-region replication are out of P0; the latter is captured as a deferred task at the end of this file.

Tasks are ordered by dependency. Each task is **independently deployable and testable**; later tasks extend or wire up earlier components. Complete each group before the next. *(Doc/req paths above are placeholders — confirm against the repo.)*

---

## Conventions (read first)

**Account / region model.** Single account, single region (`primaryRegion`) for all P0 stacks. (`replicaRegion` is referenced only by the deferred P1 replication task and is otherwise unused.)

**CDK stacks and scopes.**
| Stack | Owns |
|---|---|
| `AuditLogStorageStack` | KMS CMK, audit S3 bucket (Object Lock + versioning + Bucket Keys + SSE-KMS), lifecycle rule |
| `AuditLogCatalogStack` | Glue database + audit-event table (schema, `dt` partition, partition projection) |
| `AuditLogIngestStack` | Firehose delivery stream + its delivery IAM role |
| `AuditLogQueryStack` | Athena workgroup + results bucket + named queries |
| `AuditLogObservabilityStack` | CloudWatch alarms, CloudTrail for CMK decrypts |

**Cross-stack wiring (keep the graph acyclic + Storage independently updatable).**
- Share Storage's bucket name/ARN + CMK ARN via **SSM parameters** (Storage writes; downstream reads with `valueForStringParameter` / `fromStringParameterName`) — **not** `CfnOutput` exports. Exports get locked while imported and block Storage updates (and can force replace-instead-of-update); SSM gives deploy-ordering without the lock. Don't re-derive names.
- Author every bucket/key **grant in the *consuming* stack** against the imported resource (e.g. `key.grantEncryptDecrypt(role)` and `bucket.grantWrite(role)` in Ingest), so CDK adds the permission to the *role's identity policy*. **Never** reference a downstream role ARN from Storage (CMK key policy or bucket policy) — that adds a Storage→consumer edge and closes a cycle.
- Dependency direction is one-way toward Storage: **Storage → Catalog → Ingest → Query/Observability**. Keep it that way.

**Context keys** (define once in the CDK app; tasks reference by name):
`primaryRegion`, `objectLockDurationDays`, `retentionDays` (must be ≥ `objectLockDurationDays`), `firehoseBufferSizeMb` (default 128), `firehoseBufferIntervalSec` (default 300), `athenaBytesScannedCutoffGb`, `appQualifier` (resource-name prefix). *(P1 adds `replicaRegion`.)*

**Naming / tagging.** All resources `<appQualifier>-auditlog-<purpose>`; apply a common tag set (app, env, owner) at the app level.

---

## Group 0 — Bootstrap

- [ ] **P0-00** CDK app skeleton: instantiate the five stacks above with explicit `env` (account + `primaryRegion`), wire the context keys and naming/tagging convention, and declare inter-stack dependencies. No resources yet — stacks synth empty.
  *Deploy/test:* `cdk synth` produces five templates; `cdk deploy --all` is a no-op success.

---

## Group 1 — Storage foundation

- [ ] **P0-01** `AuditLogStorageStack`: KMS CMK (`enableKeyRotation: true`) + audit S3 bucket with **versioning**, **Object Lock GOVERNANCE** (`objectLockDurationDays`; Object Lock must be set at bucket creation), **SSE-KMS** with the CMK, **S3 Bucket Keys enabled**, and a lifecycle rule with expiration = `retentionDays` (≥ Object Lock duration, so WORM never blocks the lifecycle delete). Publish bucket name/ARN + CMK ARN to **SSM** (see Conventions). If the P0-08 error-prefix alarm needs S3 request metrics, define the bucket's **request-metrics configuration here** (it's a bucket property), not in Observability.
  *Deploy/test:* deploy; PutObject as admin → object is KMS-encrypted, versioned, and carries a retain-until date; lifecycle rule visible.

---

## Group 2 — Schema & catalog

- [ ] **P0-02** Shared schema module (code, no infra): the audit-event field list + `status` enum (`PENDING|SUCCEEDED|FAILED|SKIPPED`) as a single exported constant / JSON schema, matching design §3. This is the **single source of truth** consumed by P0-03 (Glue table), P0-05 (worker helper), and P0-09 (example events).
  *Deploy/test:* unit test validates a sample event against the schema and rejects an unknown status.

- [ ] **P0-03** `AuditLogCatalogStack`: Glue database + audit-event table built from the P0-02 schema, over the audit bucket location, with partition key **`dt` (delivery date)** and **partition projection** (`projection.enabled`, date range/format for `dt`) — no crawler. Document the **watermark contract**: `dt` reflects Firehose *delivery* time, which can lag `event_time` by up to the buffer interval (and across day boundaries), so consumers query a lookback window on `dt` (used by P0-07).
  *Deploy/test:* an Athena `SELECT … LIMIT 1` against the empty table returns zero rows with no partition error.

---

## Group 3 — Ingest

- [ ] **P0-04** `AuditLogIngestStack`: Firehose delivery stream (**direct put**) with **record-format-conversion to Parquet** using the P0-03 Glue table, buffering from `firehoseBufferSizeMb`/`firehoseBufferIntervalSec`, destination = audit bucket with `dt=!{timestamp:yyyy/MM/dd}` prefix and an **`errorOutputPrefix`** for delivery failures, SSE via the P0-01 CMK. Create the **Firehose delivery role**: write to the bucket (data + error prefixes), read the Glue table, `kms:GenerateDataKey`/`Decrypt` on the CMK. Author these grants **in this stack** against the imported bucket/CMK (identity-based on the delivery role) — do **not** add a bucket policy or CMK key-policy statement that references the delivery-role ARN, which would create a Storage→Ingest cycle.
  *Deploy/test:* `PutRecord` a sample event (matching P0-02) → within one buffer interval a Parquet object lands under `dt=…`; a malformed record lands under the error prefix.

- [ ] **P0-05** Worker ingest helper (code): `putAuditEvent()` wrapping `PutRecord` with exponential backoff + jitter, retry-vs-terminal classification (throttling → retry; persistent failure → surface as unit-of-work failure), validating payload against P0-02. Grant the worker role `firehose:PutRecord` on the P0-04 stream.
  *Deploy/test:* unit test covers backoff + terminal classification (mocked client); one live `PutRecord` against the deployed stream succeeds and is queryable after flush.

---

## Group 4 — Query

- [ ] **P0-06** `AuditLogQueryStack`: Athena workgroup with a dedicated **results bucket** (SSE-KMS, short lifecycle expiry) as output location, and a **`BytesScannedCutoffPerQuery`** control limit = `athenaBytesScannedCutoffGb` (hard per-query cap).
  *Deploy/test:* run an ad-hoc query in the workgroup → results written to the results bucket; a query exceeding the cutoff is rejected.

- [ ] **P0-07** Named queries in the P0-06 workgroup over the P0-03 table: **events by `batch_id`**, **by `item_id`**, **by `tenant_id`** — each taking a date range, pruning on `dt` with the P0-03 lookback window, and **deduplicating on `event_id`** (`COUNT(DISTINCT …)` / `ROW_NUMBER()` over `event_id`).
  *Deploy/test:* against seeded data the three named queries return the expected rows with no duplicates.

---

## Group 5 — Observability

- [ ] **P0-08** `AuditLogObservabilityStack`: CloudWatch alarms for (a) **error-prefix object count > 0** (Firehose delivery failures) and (b) **`DeliveryToS3.Success` < threshold** over N periods; plus a **CloudTrail** trail/event-selector capturing `kms:Decrypt` on the P0-01 CMK, writing to a **dedicated trail-logs bucket owned by this stack** (don't repoint or re-policy the audit bucket from here — that splits Storage ownership and adds an Observability→Storage edge). Alarms reference metrics by namespace/name **string**, so they add no CFN dependency on Storage/Ingest. (Key rotation is already enabled in P0-01.)
  *Deploy/test:* deploy; synthetically drop an object under the error prefix → alarm enters ALARM; a decrypt against the CMK appears in CloudTrail.

---

## Group 6 — Validation

- [ ] **P0-09** Example-events module: one valid event per `status` value, validated against the P0-02 schema; reusable fixture for tests/seeding.
  *Deploy/test:* all four validate; serializable to the Parquet/JSON shape Firehose expects.

- [ ] **P0-10** Integration smoke test (requires Groups 2–4 deployed + worker role from P0-05): emit the P0-09 events via `putAuditEvent()` → wait for Firehose flush → run the P0-07 named queries → assert expected rows, deduplicated on `event_id`.
  *Deploy/test:* the test passes end-to-end against a deployed environment and cleans up seeded data.

---

## Group 7 — Resilience (P1 — deferred)

> Do **not** start until all P0 tasks are end-to-end complete and verified. This is the only cross-region work; it adds disaster-recovery durability and changes no P0 functional behaviour.

- [ ] **P1-01** Cross-region replication of the audit log. Introduce `AuditLogReplicaStack` in `replicaRegion` (replica KMS CMK + replica S3 bucket with versioning + Object Lock GOVERNANCE matching `objectLockDurationDays`), then extend `AuditLogStorageStack` with a **replication role + rule** (audit bucket → replica bucket). Specifics:
  - Replication role: read/replicate source objects + retention metadata, `kms:Decrypt` on the source CMK, `kms:Encrypt` on the replica CMK; the **replica CMK key policy must allow this role** (the classic cross-region-KMS replication failure — set both sides). Define the role and rule **in `AuditLogStorageStack`** (the bucket's owner) so the Storage→replica grant points outward to the imported replica ARNs and doesn't create an inbound edge.
  - Pass the replica bucket/CMK ARNs to the primary stack via context/SSM (CloudFormation cross-stack refs do not cross regions).
  - Decide whether the rule includes the `errorOutputPrefix` objects (replicate them — they are part of the durable record).
  - **Backfill**: replication copies only objects written after the rule is enabled; run S3 Batch Replication if pre-existing objects must be mirrored.
  - **Monitoring**: alarm on `OperationFailedReplication` and replication latency (un-replicated objects fail silently with no error written to the replica).
  *Deploy/test:* PutObject in the audit bucket → object appears in the replica bucket with replicated retain-until date; a forced failure raises the replication alarm.

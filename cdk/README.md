# Fanout Audit Log Infrastructure

AWS CDK (TypeScript) infrastructure for the fanout audit log. See `docs/tasks/tasks-audit-log-p0.md` for implementation status.

## Stacks

| Stack | Description |
|---|---|
| `*-Replica` | Disaster-recovery S3 bucket and CMK in the secondary region. Deploy first. |
| `*-Storage` | Audit S3 bucket (WORM, SSE-KMS, versioning), lifecycle rule, cross-region replication. |
| `*-Catalog` | Glue database and audit-event table with `dt` partition projection. |
| `*-Ingest` | Firehose delivery stream (Parquet conversion) and worker ingest helper. |
| `*-Query` | Athena workgroup, results bucket, and named audit queries. |
| `*-Observability` | CloudWatch alarms and CloudTrail for CMK decrypt events. |

Deploy order: Replica → Storage → Catalog → Ingest → Query / Observability.

## Useful commands

* `npm run test`    compile and run jest unit tests
* `npx cdk synth`   synthesize CloudFormation templates
* `npx cdk deploy`  deploy to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state


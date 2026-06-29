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

## Steps to deploy changes to dev account

1. Load local AWS credentials/profile for your dev account.
2. Run `npm run test && npx cdk synth` and validate all tests pass and CDK stacks can be successfully synthesized into CloudFormation templates.
3. Run `npx cdk bootstrap` if you have not done this before (one-time set-up) to deploy CDK toolkit resources required for subsequent CDK stack deployments.
4. Run `npx cdk deploy --all` to deploy all CDK stacks to your dev account, or `npx cdk deploy SOME_STACK_NAME` to deploy a specific CDK stack.

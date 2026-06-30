# fanout-audit-log

Append-only audit log for fan-out work-item workflows on AWS.

Workers emit one structured event per work-item occurrence. Events are buffered via AWS Firehose, converted to Parquet, and written to a write-once-read-many (WORM) S3 bucket partitioned by delivery date and queried via Athena.

## Architecture (P0 components)

```mermaid
flowchart TD
    W["Worker<br/>per work item: execute · classify · emit"]

    subgraph AUDIT["Audit Event Log — append-only, queryable"]
        direction TB
        FH["Amazon Data Firehose<br/>direct PutRecord · buffer · Parquet convert"]
        S3[("S3 Audit Bucket<br/>Parquet · partitioned by date<br/>Object Lock WORM · SSE-KMS")]
        ERR[("S3 error prefix")]
        GLUE["Glue table<br/>partition projection"]
        ATH["Amazon Athena"]
    end

    P0(["Audit queries<br/>by batch · item · tenant"])

    W -- "emit work-item events" --> FH
    FH -- "buffered Parquet objects" --> S3
    FH -. "delivery failure" .-> ERR
    S3 --> GLUE --> ATH --> P0

    classDef store fill:#e3f2fd,stroke:#1565c0,color:#0d2b45;
    classDef compute fill:#fff3e0,stroke:#ef6c00,color:#4a2400;
    classDef out fill:#e8f5e9,stroke:#2e7d32,color:#10351a;
    class S3,ERR store;
    class FH,GLUE,ATH compute;
    class P0 out;
```

See [docs/design/technical-design.md](./docs/design/technical-design.md) for technical design.

## Querying audit logs in Athena

The audit logs are queryable via a dedicated Athena workgroup.

**Steps:**

1. Open the [Athena console](https://console.aws.amazon.com/athena/).
2. In the top-right workgroup dropdown, select **`<appQualifier>-auditlog`** (e.g. `fanout-dev-auditlog`). If prompted to acknowledge the workgroup settings, confirm.
3. In the left panel, set the data source to **AwsDataCatalog** and the database to **`<appQualifier>-auditlog`** (e.g. `fanout-dev-auditlog`).
4. Run queries against the `audit_events` table.

**Sample query — last 7 days of events:**

```sql
SELECT
    event_id,
    event_time,
    batch_id,
    item_id,
    tenant_id,
    status,
    dt
FROM "fanout-dev-auditlog"."audit_events"
WHERE dt >= date_format(current_date - interval '7' day, '%Y/%m/%d')
  AND dt <= date_format(current_date, '%Y/%m/%d')
ORDER BY event_time DESC
LIMIT 100;
```

> `dt` is the Firehose *delivery* date, not `event_time`. Events near a day boundary may be delivered into the next day's partition. Widen the `dt` range by at least the Firehose buffer interval (default 5 min) when querying by `event_time`.

Query results are written to the `<accountId>-<stage>-audit-log-query-output` S3 bucket and expire after 14 days.

## Development

```sh
cd cdk
# Install dependencies and run unit tests
npm install && npm test
# Synthesize CDK stacks
npx cdk synth
# Deploy CDK stacks (set up AWS credentials first)
npx cdk deploy --all
```

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

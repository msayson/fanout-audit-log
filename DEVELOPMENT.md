# Development

## Prerequisites

- Java 21
- Node.js 20+
- AWS CLI configured with credentials for the target account

## Service (Kotlin Lambda)

```sh
cd service

# Test
./gradlew test

# Build deployable jar
./gradlew shadowJar
# Output: app/build/libs/app-all.jar
```

## CDK stacks

```sh
cd cdk

# Test
npm test

# Synthesize and deploy CDK stacks (requires jar to exist)
npx cdk synth && npx cdk deploy --all
```

## Deploy

```sh
# From repo root — build the jar first, then deploy
cd service && ./gradlew shadowJar
cd ../cdk && npx cdk deploy --all
```

## Validate

Invoke the deployed Lambda directly with a test event. Replace `fanout-dev` with the actual `appQualifier`.

```sh
aws lambda invoke \
  --region us-east-2 \
  --function-name fanout-dev-Ingest-Worker \
  --cli-binary-format raw-in-base64-out \
  --payload '{
    "event_id":    "evt-001",
    "event_time":  "2026-06-29T00:00:00Z",
    "enqueued_at": "2026-06-29T00:00:00Z",
    "tenant_id":   "tenant-demo",
    "batch_id":    "batch-001",
    "work_type":   "fanout-job",
    "item_id":     "item-001",
    "item_type":   "order",
    "status":      "SKIPPED",
    "skip_reason": "LEGAL_HOLD"
  }' \
  /tmp/response.json && cat /tmp/response.json
# Expected: "OK"
```

Confirm delivery by querying Athena — see the **Querying audit logs in Athena** section in [README.md](./README.md).

# Coding Standards

## General principles

- **Design-first.** No implementation begins without a requirement and a design document that references it.
- **Minimal surface area.** Write only what is needed to satisfy the requirement. No speculative abstractions.
- **Immutability by default.** Prefer immutable data structures and append-only patterns; they reflect the domain model.
- **Explicit over implicit.** Favour obvious, readable code over clever code. Comments explain *why*, not *what*.
- **No task or requirement codes in code.** Do not reference task codes (e.g. `P0-01`) or requirement IDs (e.g. `REQ-AL-01`) in source code or comments. Those identifiers belong in `docs/` only.

## CDK project layout

```
cdk/
  constants/    # shared CDK constants (stage configs, SSM parameter names)
  constructs/   # reusable L3 constructs
  interfaces/   # TypeScript interfaces shared across constructs and stacks
  stacks/       # CDK stacks (one file per stack)
```

Stacks and their responsibilities are defined in `docs/tasks/tasks-audit-log-p0.md`. The audit bucket name is deterministic (`${account}-${stage}-audit-log`) so its ARN is directly inferrable. The CMK ARN is published to SSM (key ARNs are not inferrable) — downstream stacks read it via `valueForStringParameter`.

## AWS CDK

- All infrastructure is defined in CDK (TypeScript).
- One CDK stack per logical tier (e.g. audit log stack, projection stack). Cross-stack references via exported values.
- Constructs are organised by domain, not by AWS service.
- No hardcoded account IDs or region strings. Use `Stack.of(this).account` / `.region`.
- Removal policies must be explicit (`RETAIN` for stateful resources in production, `DESTROY` for ephemeral dev stacks — set via context, never hardcoded).

## TypeScript

- `strict` mode enabled. No `any`.
- Prefer `const`; use `let` only when reassignment is necessary.
- Name things after the business concept, not the AWS service (e.g. `AuditLogBucket`, not `FirehoseDestinationBucket`).

## Kotlin (Lambda)

- Use the AWS SDK for Kotlin; construct service clients explicitly with scoped credentials — never rely on ambient credentials in library code.
- Prefer data classes for event and domain models; use `sealed class` for status and result types.

## SQL (Athena / dbt)

- Always filter on the partition column (`dt`) to prune scans.
- Deduplication: raw-log queries that count events must use `COUNT(DISTINCT event_id)`.
- dbt model names match the table they materialise (e.g. `current_state`, `item_rollups`).

## Testing

- Unit tests for all business logic; integration tests for CDK stacks (CDK assertions).
- Tests live alongside the code they cover in a `__tests__` or `test/` sibling directory.
- No test should touch a real AWS account. Use mocks (`aws-cdk-lib/assertions`, `localstack`) for infrastructure and service calls.

## Naming conventions

| Artefact | Convention | Example |
|---|---|---|
| CDK construct | PascalCase | `AuditLogStack` |
| S3 bucket logical ID | `<domain>-<purpose>-<env>` | `audit-log-raw-prod` |
| Glue table | snake_case | `audit_events` |
| dbt model | snake_case | `current_state` |
| ADR file | `decisions-NNNN-<slug>.md` | `decisions-0001-firehose-over-lambda.md` |
| Requirement file | `req-<domain>.md` | `req-audit-log.md` |
| Design file | `design-<topic>.md` | `design-audit-log.md` |
| Task file | `tasks-<topic>.md` | `tasks-audit-log-p0.md` |

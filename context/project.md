# Project

## What this is

A reference implementation of an append-only audit log for fan-out workflows on AWS.

It demonstrates how to build:
- an immutable audit event log (source of truth)
- a rebuildable current-state projection derived from that log
- operational dashboards over the projection

## Goals

- Correctness over convenience: the audit log is the only system of record.
- Cost-linear scaling: the architecture must work unchanged from 1k to 6B events/month.
- Design-first: requirements drive design; design drives implementation tasks.
- Reference quality: code and documentation serve as an example for production teams.

## Scope

**In scope:** audit event log, current-state projection, dashboards, CDK infrastructure.

**Out of scope:** the fan-out dispatch layer, work-item execution, redriveable queues.

## Key documents

| Document | Purpose |
|---|---|
| `context/architecture.md` | System components, data flow, key decisions |
| `context/glossary.md` | Canonical term definitions |
| `context/coding-standards.md` | Code style, patterns, conventions |
| `docs/` | Requirements, detailed design, ADRs, tasks |

## Repository layout

```
context/          # stable project knowledge (rarely changes)
docs/
  requirements/   # what the system must do
  design/         # how it does it
  decisions/            # architecture decision records
  tasks/          # implementation task lists
src/              # application and infrastructure code
```

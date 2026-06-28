# docs/

Documentation hierarchy for the fanout-audit-log project.

## Structure

```
docs/
  requirements/     # What the system must do
  design/           # How the system does it
  decisions/        # Architecture Decision Records
  tasks/            # Implementation task lists
```

## Traceability chain

```
requirements/req-<domain>.md
    ↓  (cited by)
design/design-<topic>.md
    ↓  (cites decisions from)
decisions/adr-NNNN-<slug>.md
    ↓  (drives)
tasks/tasks-<topic>.md
```

Every design document must cite the requirement(s) it satisfies.
Every ADR must cite the requirement or design context that prompted it.
Every task list must cite the design document it implements.

## Naming conventions

| Type | Pattern | Example |
|---|---|---|
| Requirement | `req-<domain>.md` | `req-audit-log.md` |
| Design | `design-<topic>.md` | `design-audit-log.md` |
| ADR | `decisions-NNNN-<slug>.md` | `decisions-0001-firehose-over-lambda.md` |
| Tasks | `tasks-<topic>.md` | `tasks-audit-log-p0.md` |

ADR numbers are assigned sequentially and never reused. Superseded ADRs keep their file but gain a status header.

## Cross-referencing

Use relative Markdown links: `[design](../design/design-audit-log.md)`.

A reader starting from a requirement should be able to follow links to the design, then to the ADRs that justify the key choices, then to the tasks that implement it.

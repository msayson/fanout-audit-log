# CLAUDE.md

Read these files before doing any work:

- `context/architecture.md` — system components, data flow, key constraints
- `context/glossary.md` — canonical term definitions; use these terms in all code and comments
- `context/coding-standards.md` — code style, patterns, naming conventions

## How to navigate work

Requirements → design → tasks. Always trace in this order:

1. Find the relevant requirement in `docs/requirements/`.
2. Find the design that satisfies it in `docs/design/`.
3. Find the ADRs it references in `docs/decisions/` to understand *why* choices were made.
4. Find the task list in `docs/tasks/` to know what still needs doing.

## Ground rules

- Do not invent architecture. Implement what the design specifies.
- Do not start a task without a requirement and a design document backing it.
- If a decision has an ADR, do not relitigate it without first reading the ADR.
- New architectural decisions need an ADR before implementation.
- Keep `context/` files stable. Day-to-day detail belongs in `docs/`.

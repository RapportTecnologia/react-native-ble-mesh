---
trigger: always_on
---
# Structured Logging Rule

All relevant application behavior must be logged with enough context for
debugging, auditing, and PDCL validation.

Use this pattern whenever possible:

```text
[YYYY-MM-DD HH:MM:SS] [file:function:line] level message - relevant_parameters
```

Rules:

- Log starts, completions, warnings, failures, retries, and important decisions.
- Include identifiers that help trace the operation, such as request, job, book,
  queue, or user-safe IDs.
- Never log secrets, tokens, passwords, cookies, private payloads, or full
  sensitive content.
- Keep messages clear, factual, and useful for later analysis.
- On errors, log the root context and safe diagnostic details.

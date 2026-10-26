---
trigger: always_on
---
# PDCL Rule

Always use Plan, Do, Check Logs for iterative engineering work.

1. **Plan:** clarify requirements, expected behavior, constraints, and tests.
2. **Do:** implement the smallest coherent change with structured logs.
3. **Check Logs:** run the system or tests, inspect logs, and compare behavior
   against requirements.
4. **Loop:** fix gaps, update requirements when needed, and repeat until the
   change is validated.

Do not treat code as complete until behavior, logs, and documentation are
consistent.

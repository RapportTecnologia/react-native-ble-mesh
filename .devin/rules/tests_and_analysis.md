---
trigger: always_on
---

# Tests and Analysis Rule

Every code change must be validated by systematic tests before it is
considered complete. A change without executed, recorded tests is
unfinished work.

## Test layers

- **Unit tests** — each new or modified function is exercised in
  isolation, covering normal inputs, boundary values, and revert
  conditions.
- **Integration tests** — the contract is exercised through its real
  interactions (facet calls, proxies, libraries, oracle/token
  dependencies) using the project's mocks when a dependency is not yet
  deployable.
- **Acceptance tests** — business requirements are exercised end to end
  through the same calls a user, agent, or keeper would perform.

## Practices required on every change

- Run the tests affected by the change plus the adjacent suites before
  marking the task done.
- Every bugfix ships with a regression test that fails without the fix.
- New external/public functions ship with at least a happy-path case and
  an error-path (revert) case.
- Tests must be deterministic and isolated: no order dependence, no
  shared mutable state, no real external network calls.
- Never weaken, delete, or skip an existing test to make the suite pass.
- Review generated logs after each run to confirm records are correct.
- Test real scenarios, error conditions, and edge cases — not only the
  happy path.

## White-box testing (progressive)

White-box tests read the implementation, not only its contract. They are
applied progressively: each change extends coverage of the touched
contract or library instead of trying to cover the whole codebase at
once.

- Exercise internal branches, loops, early returns, modifiers, and every
  revert path — not only inputs and outputs.
- Map every test to a `REQUIREMENTS.md` item or acceptance criterion. A
  requirement is implemented only when a test proves its behavior
  through the real code path; record the requirement ID in the test name
  or docstring.
- Progression order for the modified code: statement coverage → branch
  coverage → condition/path coverage. Track uncovered branches and
  prioritize them by risk (access control, funds movement, arithmetic
  first).
- Assert internal invariants and state transitions (storage, balances,
  roles, pause flags), not only return values and events.
- Prefer forge fuzz/invariant tests for arithmetic bounds and
  state-machine invariants.
- Record which requirement IDs the change validated, per the logging
  and PDCL rules.

## Evidence

For each change, document: commands run, tests added or updated,
results, coverage delta for the touched contract, and the requirement
IDs verified. On failure, analyze the root cause, fix it, and re-run the
full chain — never patch the symptom.

## Project specifics

- Runners: `npm test` (Hardhat), `npm run test:foundry` (forge —
  including fuzz and invariant tests), `npm run test:coverage` /
  `npm run analyze:coverage` (Hardhat coverage plus report script).
- Security-sensitive paths (access control, value transfer, upgrade
  logic) require dedicated tests before deploy, per the
  solidity-security checklist.

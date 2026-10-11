---
trigger: always_on
---

# Tests and Analysis Rule

Every code change must be validated by systematic tests before it is
considered complete. A change without executed, recorded tests is
unfinished work.

## Test layers

- **Unit tests** — each new or modified module/function is exercised in
  isolation, covering normal inputs, boundary values, and error
  conditions.
- **Integration tests** — the module is exercised with its real
  collaborators (mesh provisioning, bearer layers) or the project's
  standard test doubles (mocked native modules) when hardware is
  unavailable.
- **Acceptance tests** — business requirements are exercised end to end
  through the same flows the host app performs (scan, provision,
  send/receive).

## Practices required on every change

- Run `npm test` (Jest) plus `npm run lint` before marking the task
  done; use `npm run test:coverage` for the coverage delta.
- Every bugfix ships with a regression test that fails without the fix.
- New public APIs ship with at least a happy-path case and an
  error-path case.
- Tests must be deterministic and isolated: no order dependence, no
  shared mutable state, no real BLE/radio access — mock native modules.
- Never weaken, delete, or skip an existing test to make the suite pass.
- Review generated logs after each run to confirm records are correct.
- Test real scenarios, error conditions, and edge cases — not only the
  happy path.

## White-box testing (progressive)

White-box tests read the implementation, not only its contract. They are
applied progressively: each change extends coverage of the touched
module instead of trying to cover the whole project at once.

- Exercise internal branches, loops, early returns, timeouts, and error
  callbacks — not only inputs and outputs.
- Map every test to a `REQUIREMENTS.md` item or acceptance criterion. A
  requirement is implemented only when a test proves its behavior
  through the real code path; record the requirement ID in the test name
  or docstring.
- Progression order for the modified code: statement coverage → branch
  coverage → condition/path coverage. Track uncovered branches and
  prioritize them by risk (crypto/provisioning, key handling, transport
  reassembly first).
- Assert internal invariants and state transitions (mesh state, keys,
  sequence numbers), not only emitted events.
- Record which requirement IDs the change validated, per the logging
  and PDCL rules.

## Evidence

For each change, document: commands run, tests added or updated,
results, coverage delta for the touched module, and the requirement IDs
verified. On failure, analyze the root cause, fix it, and re-run the
full chain — never patch the symptom.

## Project specifics

- Runner: `npm test` → Jest (`jest.config.js`); coverage:
  `npm run test:coverage`; lint: `npm run lint` / `lint:fix`.
- This is a React Native library — mock the native BLE layer; hardware
  behaviors (mesh timing, radio loss) are validated on-device and
  recorded as manual evidence.
- Flag in `REQUIREMENTS.md` any logic that can only be verified on
  hardware.

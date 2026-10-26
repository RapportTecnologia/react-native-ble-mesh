---
trigger: always_on
---
Code documentation must always follow best practices.

## Author and Contact Metadata

Every source file must carry a file-header docblock identifying the author
and providing contact information:

```text
Author:  Carlos Delfino
Email:   consultoria@carlosdelfino.eti.br
WhatsApp: +55 (85) 98520-5490
```

## Structure of Every Docblock

1. **First line:** a one-sentence summary of the entity being documented.
2. **Second line:** a description and rationale for the entity — what it does
   and why it exists.
3. **Then** entity-specific details, as applicable:

### Functions and Methods

- `@param` — name, type, and purpose of every parameter.
- `@returns` / `Returns:` — type and meaning of the returned value.
- `@throws` / `Raises:` — error conditions and which exceptions may occur.
- Side effects (I/O, state mutation, external calls) when not obvious.
- A short usage example for non-trivial public APIs.

### Classes

- Responsibility of the class and the design pattern it implements
  (e.g. Factory, Singleton, Repository).
- Important collaborators and injected dependencies.
- Lifecycle notes (construction, disposal, thread-safety) when relevant.

### Parameters, Variables, and Constants

- Purpose, expected units/format, and valid ranges.
- For constants: why the value was chosen and the impact of changing it.

## Format Conventions

- **JavaScript/TypeScript:** JSDoc (`/** ... */` with `@param`, `@returns`,
  `@author`).
- **Python:** docstrings (Google or NumPy style) with type hints in the
  signature.
- **Solidity:** NatSpec (`/// @notice`, `/// @dev`, `@param`, `@return`).
- Place the docblock immediately above the documented entity; file-level
  headers go at the top of the file.

## Quality Rules

- Document the *why*, not just the *what* — the code already shows what it does.
- Keep documentation in sync with the code: any change to behavior, signature,
  or contract must update the corresponding docblock in the same commit.
- Never include secrets, tokens, private keys, or sensitive data in docblocks.
- Prefer precise, concise language; avoid restating the obvious
  (e.g. `@param name the name` adds no value).
- Public APIs, exported functions, and service boundaries must always be
  documented; private helpers may use shorter inline comments.

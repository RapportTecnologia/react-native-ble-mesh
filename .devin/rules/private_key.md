---
trigger: always_on
---

# Private Key and Embedded Secret Handling Rule

Whenever a file contains embedded private keys, passwords, API tokens, or any
other secret value, the assistant must follow the procedure below **before**
making any other change or committing the file.

## 1. Detect

Scan every file being read or edited for patterns that indicate embedded
secrets, including but not limited to:

- `private_key`, `privateKey`, `PRIVATE_KEY`
- `password`, `passwd`, `pwd`, `secret`
- `api_key`, `apiKey`, `API_KEY`, `token`
- hex strings longer than 32 characters near key-like identifiers
- `0x`-prefixed 64-character strings (EVM private keys)
- base64 or PEM blocks (`-----BEGIN ... PRIVATE KEY-----`)

## 2. Extract and relocate to `.env`

When a secret is found embedded in a source file:

1. **Create or update** the appropriate `.env` file (or `.env.example` for
   documentation) with the secret mapped to a descriptive environment variable
   name.
2. **Remove** the literal secret value from the original file.
3. **Replace** it with a reference to the environment variable
   (e.g. `process.env.SECRET_NAME`, `os.environ.get("SECRET_NAME")`,
   `dotenv.get("SECRET_NAME")`).
4. **Ensure** `.env` is listed in `.gitignore` and is never committed.
5. **Never** write the actual secret value into `.env.example`; use a
   placeholder such as `<your-secret-here>`.

## 3. Use indirection instead of explicit values

When a script or command needs to use a secret:

- **Prefer** writing a wrapper script that reads the secret from the
  environment at runtime (e.g. via `dotenv`, `os.environ`, or a secrets
  manager) and passes it to the target command without printing it.
- **Never** hardcode the secret value in scripts, shell commands, Makefiles,
  CI pipelines, or configuration files.
- **Avoid** command-line arguments that expose the secret in the process list
  (e.g. `--private-key=0x...`). Instead, use environment variables or
  stdin.
- **Never** log, echo, or print the secret value, not even in debug or
  verbose mode.

## 4. Sanitize existing files

When editing a file that already contains an embedded secret:

1. Move the secret to `.env` as described above.
2. Replace the literal value with an environment variable reference.
3. If the file is tracked in git, consider whether a full purge of the secret
   from git history is warranted and warn the user about it.
4. Log the action with a sanitized message — never include the secret value
   in logs.

## 5. Review checklist

Before considering a task complete, verify:

- [ ] No secret value remains in any source file, script, or configuration.
- [ ] All secrets are stored in `.env` (git-ignored) or a secrets manager.
- [ ] `.env.example` contains only placeholders, never real values.
- [ ] Scripts reference secrets via environment variables, not literals.
- [ ] No secret appears in logs, terminal output, or documentation.
- [ ] The user has been warned if a secret was previously committed to git.

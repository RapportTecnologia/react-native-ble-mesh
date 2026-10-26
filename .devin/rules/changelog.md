---
trigger: model_decision
description: Manage CHANGELOG.md and commit messages following Conventional Commits / conventional-changelog spec
---
# Changelog Rule

Project history must be recorded through **Conventional Commits** commit
messages and a generated-style `CHANGELOG.md` at the module root, following
the [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog)
specification and [Keep a Changelog](https://keepachangelog.com/) layout.

This rule complements `documentation.md`: that rule governs the per-document
changelog table and mandatory headers/badges/footers of every `.md` file;
this rule governs the project's release history file and the commit
messages that feed it.

## Commit messages (Conventional Commits)

Every commit must follow:

```text
type(scope)!: short description

[optional body]

[optional footers: BREAKING CHANGE: ..., Refs: #123]
```

- **Allowed types:** `feat`, `fix`, `perf`, `refactor`, `docs`, `style`,
  `test`, `build`, `ci`, `chore`, `revert`.
- **Scopes** (suggested, use the most specific that applies): `contracts`,
  `dao`, `access`, `libs`, `interfaces`, `scripts`, `docs`, `ci`,
  `requirements`, `deploy`.
- **Breaking changes:** append `!` after the type/scope **and** add a
  `BREAKING CHANGE:` footer describing the impact and migration path.
- **Issue reference:** include the related issue (`Refs: #123` or
  `Closes: #123`) per the `git.md` workflow.
- Subject line in imperative mood, lowercase, no trailing period.

## Versioning (SemVer)

- `fix`, `perf`, `revert` → **patch** bump.
- `feat` → **minor** bump.
- `BREAKING CHANGE` (or `!`) → **major** bump.
- Security fixes are bumped as `fix` but must be highlighted under a
  `### Security` subsection of the release.

## CHANGELOG.md format

- Located at the module root; create it if missing.
- Because it is a project `.md` file, it must carry the capsule-render
  header, badges, and footer mandated by `documentation.md`.
- Structure, newest first:

```markdown
# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and versions adhere to
[Semantic Versioning](https://semver.org/), generated from
[Conventional Commits](https://www.conventionalcommits.org/) history.

## [Unreleased]

## [x.y.z] - YYYY-MM-DD

### Features
- **scope:** description ([`abc1234`](commit-url), closes #123)

### Bug Fixes
- **scope:** description ([`abc1234`](commit-url))

### BREAKING CHANGES
- **scope:** description and migration notes
```

- Subsections map from commit types: `Features` (feat), `Bug Fixes` (fix),
  `Performance` (perf), `Reverts` (revert), `BREAKING CHANGES`, plus
  secondary groups `Documentation`, `Refactoring`, `Tests`, `Build System`,
  `CI`, `Chores` per conventional-changelog presets. Omit empty groups.
- Each entry carries the short description, commit short-hash, and issue
  reference.
- Requirement IDs verified by the change (per `requirements.md` and
  `tests_and_analysis.md`) may be cited inline in the entry.

## Generation

- Prefer generating from git history with a conventional-changelog-family
  tool when a `package.json` is available, e.g.
  `npx conventional-changelog -p angular -i CHANGELOG.md -s -r 0`, or
  `standard-version` / `release-please` for release automation.
- Without tooling, maintain the file manually in exactly the same format —
  the format must not depend on the tool used.
- Never rewrite or reorder already-published release sections; new work
  always lands under `## [Unreleased]` until a release is cut, then it is
  moved under the new `## [x.y.z] - YYYY-MM-DD` heading.
- The per-document changelog table inside other `.md` files (per
  `documentation.md`) remains required and independent of this file.

## Checklist

Before considering a change complete:

- [ ] Commit message uses a valid Conventional Commits type and scope.
- [ ] Breaking changes carry `!` and a `BREAKING CHANGE:` footer.
- [ ] Entry added under `[Unreleased]` (or the release being cut).
- [ ] Issue referenced in commit and changelog entry.
- [ ] SemVer bump is consistent with the change types included.
- [ ] `CHANGELOG.md` keeps the mandatory header/badges/footer.

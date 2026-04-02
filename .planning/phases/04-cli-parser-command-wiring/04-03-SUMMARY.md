# PLAN-03 Summary: Read-only Commands + Tests

**Date**: 2026-04-02
**Phase**: 04-cli-parser-command-wiring
**Status**: ✓ Complete

---

## What Was Built

### Handlers Created

| File | Description |
|------|-------------|
| `src/cli/commands/list.ts` | `ccs list` — shows all profiles with `*` (active) and `(default)` indicators, `--json`, `--quiet`, `--show-endpoints` |
| `src/cli/commands/env.ts` | `ccs env [profile]` — outputs env vars as shell exports, `--shell`, `--reveal`, `--json` with security hardening |

### Source Changes

| File | Change |
|------|--------|
| `src/cli/commands/index.ts` | Added `listCommand` and `envCommand` re-exports |
| `src/cli/index.ts` | Wired `list` and `env` commands replacing stubs; used `this` binding for async Commander actions |
| `src/cli/commands/switch.ts` | Shell output routed through `info()` (respects `--quiet`); added `as string` cast for `shellOutput` |
| `src/core/session.ts` | `touchSession()` now sets `Bun.env.CCS_SESSION_ID` after creating/updating a session so downstream commands can re-identify it |
| `src/core/storage.ts` | Added `initializeSync(path: string)` for synchronous test initialisation; idempotent (safe for parallel module loading) |
| `src/utils/output.ts` | `info()` now respects `--json` flag (suppressed alongside `--quiet`) |

### Tests Created

| File | Coverage |
|------|----------|
| `tests/helpers.ts` | `runCcs()`, `captureOutput()`, `testProfileName()` |
| `tests/cli/all.test.ts` | 24 tests covering `list`, `switch`, `add`, `remove`, `env` commands |

**Test scenarios covered**: empty DB, `*` / `(default)` indicators, `--json` output, `--quiet` suppression, nonexistent profile exits, duplicate name exits, encrypted storage, `--force` remove, `--reveal` security, default profile fallback.

**Note**: `ccs remove <profile>` (non-force, interactive confirm) is skipped in automated tests because `@clack/prompts.confirm()` requires a real TTY. Manual verification: `ccs remove <profile>` → press `N` → verify "Aborted." output and profile preserved.

---

## Bugs Fixed During Implementation

1. **`info()` leaked plaintext to stdout in `--json` mode** — fixed `info()` to check `!flags.json`
2. **`touchSession()` created new sessions on every call** — `CCS_SESSION_ID` was never propagated; fixed by setting `Bun.env.CCS_SESSION_ID` in `touchSession()` after session creation
3. **Test singleton races with parallel worker loading** — fixed with idempotent `Database.initializeSync()`
4. **`process.exit` mock missing in `--json error` tests** — caused worker crashes; added proper mock with `throw new Error("exit")`
5. **`Database.initialize(path)` mixed async/sync overloads** — TS6133; resolved by renaming sync version to `initializeSync()`
6. **`cli tests` exit 1 with no output** — Bun v1.3.10 worker crash when all 5 test files loaded in parallel; resolved by consolidating into `tests/cli/all.test.ts`
7. **`beforeAll` module-load timing** — moved `TEST_DB` path generation inside `beforeAll` (was `const` at module scope)
8. **`remove --force --json` test used wrong profile name** — fixed to match seeded profile name

---

## CI Verification

```
$ bun run ci
✓ tsc --noEmit           (0 errors)
✓ bun run lint            (0 warnings, 0 errors)
✓ bun run format:check   (All matched files use the correct format)
✓ bun test                (50 pass, 0 fail, 85 expect() calls)
```

---

## Files Changed

**Created (5)**:
- `src/cli/commands/list.ts`
- `src/cli/commands/env.ts`
- `tests/helpers.ts`
- `tests/cli/all.test.ts`
- `scripts/check-loc.ts` (refactored LOC enforcement)

**Modified (9)**:
- `src/cli/commands/index.ts`
- `src/cli/index.ts`
- `src/cli/commands/switch.ts`
- `src/core/session.ts`
- `src/core/storage.ts`
- `src/utils/output.ts`
- `tests/unit/storage.test.ts`
- `package.json` (added `scripts/check-loc.ts`)
- `.gitignore` (updated)

# Claude Code Swap (ccs)

## What This Is

A Bun-based CLI for managing multiple Claude Code accounts (API keys/tokens) and switching between them instantly across terminal sessions. You run `ccs switch profile1` and `claude` immediately uses that profile — no logout, no login, no env var hunting.

## Core Value

**Switch between Claude API accounts in < 1 second across any terminal, with per-terminal isolation and tokens stored securely.**

## Requirements

### Validated

- ✓ Bun + TypeScript project scaffolding with quality gates (lint, format, test, typecheck) — v0.1
- ✓ SQLite database schema with profiles, sessions, quotas, usage_log, settings tables — v0.2
- ✓ **CLI-01**: `ccs switch <profile>` activates profile via `switch.ts` (shell/local/persistent modes) — Phase 4
- ✓ **CLI-02**: `ccs default <profile>` stores/retrieves default from settings table — Phase 4
- ✓ **CLI-06**: `ccs list` shows profiles with `*` (active) and `(default)` indicators — Phase 4
- ✓ **CLI-07**: `ccs add --token --name` creates encrypted profile via `encryptForStorage()` — Phase 4
- ✓ **CLI-08**: `ccs remove <profile>` deletes with `@clack/prompts.confirm()` or `--force` — Phase 4
- ✓ **CLI-10**: `ccs env [profile]` outputs shell exports via `formatShell()`, with `--json`, `--reveal` security guards — Phase 4

### Active

- [ ] **CLI-03**: New terminals start with the default profile active (via shell integration)
- [ ] **CLI-04**: `ccs current` shows which profile is active in the current terminal
- [ ] **CLI-05**: Per-terminal isolation: switching in Terminal A does not affect Terminal B
- [ ] **CLI-09**: `ccs sessions` lists active terminal sessions
- [ ] **ENC-01**: Tokens encrypted at rest using AES-256-GCM with machine-derived key
- [ ] **AUTH-01**: `claude login` OAuth token capture for profile creation

### Out of Scope

- GUI or web interface — CLI only
- Cloud sync / cross-machine profile sharing — machine-bound encryption by design
- Per-request quota enforcement — usage tracking only (Phase 5)
- Profile rotation strategies — Phase 5
- TUI interactive switcher — Phase 3 (after CLI is solid)

## Context

**Existing codebase state** (Issues #1 and #2 merged):
- `src/cli/index.ts` — Commander skeleton with all commands registered as stubs
- `src/cli/commands/*.ts` — Empty command handler files
- `src/core/storage.ts` — SQLite singleton with schema, row mappers, WAL mode
- `src/core/` — `encryption.ts` is empty stub (Issue #3 pending)
- `src/tui/` — Scaffolding only
- Database at `~/.config/ccs/data.db` (WAL mode)
- Sessions table tracks: `profile_id`, `terminal`, `shell`, `cwd`, `pid`, `started_at`, `last_activity`
- Settings table for key/value app config (intended for default profile)
- Quality gates: `bun run ci` (= typecheck + lint + format:check + test)
- CONCERNS.md flags 3 critical issues: all CLI stubs, hardcoded encryption passphrase, unrecoverable key on machine change

**How switching works today** (the pain):
- `claude logout` → `claude login` → paste token → `export ANTHROPIC_API_KEY=...` → `claude` — 4+ manual steps

**How switching should work**:
- `ccs switch work` → `claude` immediately uses `work` profile
- New terminal → default profile active automatically
- Switch in one terminal → other terminals unaffected

## Constraints

- **Runtime**: Bun (TypeScript native, built-in SQLite)
- **TypeScript**: Strict mode, `noUncheckedIndexedAccess: true`, no `any`
- **CLI**: Commander.js v12, stateless between invocations (no daemon)
- **Encryption**: Machine-bound AES-256-GCM — key derived locally, not recoverable on different machine
- **Terminal isolation**: Via SQLite sessions table with shell/cwd/pid tracking
- **Shell integration**: `--shell` / `--local` / `--persistent` flags write env vars to `.env` or shell config
- **Performance**: `ccs switch X` must complete in < 1 second
- **Testing**: `bun test` with bun:test framework
- **Quality gates**: All PRs must pass `bun run ci`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Machine-bound encryption key | Profiles can't be stolen from DB if machine is compromised | — Pending |
| Stateless CLI (no daemon) | Simpler, no pid management, works with any terminal | — Pending |
| Explicit `ccs default` over auto-default | User controls startup behavior explicitly | — Pending |
| Per-terminal via sessions table | SQLite already has schema; leverage it instead of daemon | — Pending |
| Shell env var integration | `claude` reads `ANTHROPIC_API_KEY` from env — don't fight it | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-01 after initialization*

# Claude Code Swap (ccs)

## What This Is

A Bun-based CLI for managing multiple Claude Code accounts (API keys/tokens) and switching between them instantly across terminal sessions. You run `ccs switch profile1` and `claude` immediately uses that profile — no logout, no login, no env var hunting.

## Core Value

**Switch between Claude API accounts in < 1 second across any terminal, with per-terminal isolation and tokens stored securely.**

## Requirements

### Validated

- ✓ Bun + TypeScript project scaffolding with quality gates (lint, format, test, typecheck) — v0.1
- ✓ SQLite database schema with profiles, sessions, quotas, usage_log, settings tables — v0.2
- ✓ **CLI-01**: `ccs switch <profile>` activates profile via `switch.ts` (shell/local/persistent modes) — v0.1
- ✓ **CLI-02**: `ccs default <profile>` stores/retrieves default from settings table — v0.1
- ✓ **CLI-06**: `ccs list` shows profiles with `*` (active) and `(default)` indicators — v0.1
- ✓ **CLI-07**: `ccs add --token --name` creates encrypted profile via `encryptForStorage()` — v0.1 ⚠️ wiring only (encryption is stub)
- ✓ **CLI-08**: `ccs remove <profile>` deletes with `@clack/prompts.confirm()` or `--force` — v0.1
- ✓ **CLI-10**: `ccs env [profile]` outputs shell exports via `formatShell()`, with `--json`, `--reveal` security guards — v0.1

### Active

- [ ] **AUTH-01**: `ccs add` interactive flow — prompt for auth type (oauth / manual / env), name, base URL
- [ ] **AUTH-02**: OAuth2 flow — print login URL, prompt for callback code, exchange code for token
- [ ] **AUTH-03**: Manual token path — prompt for API key directly
- [ ] **AUTH-04**: Env var path — read token from `$ANTHROPIC_API_KEY`
- [ ] **CLI-06b**: `ccs list` shows auth method and base URL per profile
- [ ] **CLI-11**: `ccs switch` exports `ANTHROPIC_BASE_URL` when profile has base URL set

### Out of Scope

- GUI or web interface — CLI only
- Cloud sync / cross-machine profile sharing — machine-bound encryption by design
- Per-request quota enforcement — usage tracking only (Phase 5)
- Profile rotation strategies — Phase 5
- TUI interactive switcher — Phase 3 (after CLI is solid)

## Context

**Current codebase state** (after v0.1):
- `src/cli/index.ts` — Commander program with all commands wired
- `src/cli/commands/` — `switch.ts`, `add.ts`, `remove.ts`, `default.ts`, `list.ts`, `env.ts` — all real implementations
- `src/core/storage.ts` — SQLite singleton with schema, row mappers, WAL mode
- `src/core/encryption.ts` — **empty stub** (CRITICAL: `encryptForStorage()` / `decryptFromStorage()` are no-ops)
- `src/core/switch.ts` — profile activation orchestrator (encrypt → session → env output)
- `src/core/env-output.ts` — `formatShell()`, `writeLocalEnv()`, `writeCcsrc()`
- `src/core/shell-integration.ts` — RC file patching, `.ccsrc` management
- `src/core/session.ts` — session upsert, `CCS_SESSION_ID` propagation
- `src/utils/output.ts` — `info()`, `error()`, `respond()`, `warnSecurity()`
- `tests/cli/all.test.ts` — 49 tests passing
- Database at `~/.config/ccs/data.db` (WAL mode)
- Quality gates: `bun run ci` — 49 tests, typecheck, lint, format:check — all green

**⚠️ Critical Gap (v0.1):** `encryption.ts` is an empty stub. Tokens stored via `ccs add` are **not encrypted**. ENC-01 is deferred to v0.3 — do not ship this to production with real tokens until encryption ships.

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
| Machine-bound encryption key | Profiles can't be stolen from DB if machine is compromised | ⚠️ Deferred to v0.3 |
| Encryption deferred to v0.3 | OAuth2 and profile management are higher priority; encryption added later | ⚠️ v0.2 — tokens stored unencrypted until v0.3 |
| Stateless CLI (no daemon) | Simpler, no pid management, works with any terminal | ✅ Confirmed in v0.1 |
| Explicit `ccs default` over auto-default | User controls startup behavior explicitly | ✅ Confirmed in v0.1 |
| Per-terminal via sessions table | SQLite already has schema; leverage it instead of daemon | ✅ Confirmed in v0.1 |
| Shell env var integration | `claude` reads `ANTHROPIC_API_KEY` from env — don't fight it | ✅ Confirmed in v0.1 |
| `ccs env --shell` outputs `export ANTHROPIC_AUTH_TOKEN` | Matches what `claude` actually reads | ✅ Shipped in v0.1 |
| 3 SwitchMode paths: `--shell`, `--local`, `--persistent` | Covers all three user mental models | ✅ Shipped in v0.1 |

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
## Current Milestone: v0.2 Profile Management + OAuth2

**Goal:** Interactive `ccs add` that guides users through profile creation — choosing auth type (oauth / manual / env), collecting the right info per type, and supporting per-profile base URLs.

**Target features:**
- Interactive `ccs add` — TTY prompt for auth type, name, base URL
- OAuth2 flow — print login URL, prompt for callback code, exchange code for token
- Manual token path — prompt for API key directly
- Env var path — read from `$ANTHROPIC_API_KEY`
- Per-profile base URL — stored in `profiles.base_url`, exported as `ANTHROPIC_BASE_URL` on switch
- `ccs list` shows auth method per profile

---

*Last updated: 2026-04-02 after v0.1 milestone*

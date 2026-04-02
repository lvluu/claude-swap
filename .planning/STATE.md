---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-02T03:51:29.482Z"
progress:
  total_phases: 10
  completed_phases: 0
  total_plans: 0
  completed_plans: 3
---

# STATE.md — ccs v1.0

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-01 after initialization)

**Core value**: Switch between Claude API accounts in < 1 second across any terminal, with per-terminal isolation and tokens stored securely.

**Current focus**: Phase 4 — CLI Parser & Command Wiring (Issue #4)

---

## Current Phase

**Phase 4: CLI Parser & Command Wiring**
Issue: #4 — CLI Parser and Command Structure
Status: Executing Phase 04

**Plan 04-01: Infrastructure Layer**
Status: ✓ Complete (2026-04-01)
Files: src/utils/output.ts, src/cli/init.ts, src/core/session.ts, src/core/env-output.ts, src/core/shell-integration.ts, src/core/switch.ts

**Plan 04-02: CLI Command Handlers**
Status: ✓ Complete (2026-04-01)
Files: src/cli/commands/switch.ts, src/cli/commands/add.ts, src/cli/commands/remove.ts, src/cli/commands/default.ts, src/cli/commands/index.ts
Commits: 41ccf3a, c6b7171, 6825017, e016534
Notes: Fixed TS6133 (this/opts in action callbacks), TS2353 (mask not in TextOptions), TS2375 (exactOptionalPropertyTypes base_url spread). Removed mask from @clack/prompts text().

**Plan 04-03: Read-only Commands + Tests**
Status: ✓ Complete (2026-04-02)
Files: src/cli/commands/list.ts, src/cli/commands/env.ts, tests/helpers.ts, tests/cli/all.test.ts
Notes: Fixed info() plaintext leak in --json mode, touchSession() CCS_SESSION_ID propagation, idempotent Database.initializeSync(), info() respects --json flag. Consolidated 5 test files into tests/cli/all.test.ts (Bun v1.3.10 worker crash fix). CI: 50 pass, 0 fail.

---

## Active Issues

| Issue | Title | Phase | Blocked By | Status |
|-------|-------|-------|------------|--------|
| #3 | Encryption Utilities | 1 | — | 📋 Todo |
| #5 | Type Definitions and Interfaces | 2 | — | 📋 Todo |
| #6 | Shell Integration Infrastructure | 3 | 1, 2 | 📋 Todo |
| **#4** | **CLI Parser and Command Structure** | **4** | **1, 3** | 🚧 Phase 4 — Plans 04-01, 04-02, 04-03 complete |
| #7 | Profile Management CRUD | 5 | 4 | 📋 Todo |
| #8 | Shell Integration Bootstrap | 6 | 4 | 📋 Todo |
| #9 | Basic Switch Command | 7 | 6 | 📋 Todo |
| #10 | Visibility Commands | 8 | 7 | 📋 Todo |
| #11 | Health Checks & Doctor | 9 | 8 | 📋 Todo |
| #12 | Export Profiles to JSON | 10 | 9 | 📋 Todo |

**Merged issues**: #1 (scaffolding), #2 (SQLite schema)

---

## Open Decisions

| # | Decision | Rationale | Status |
|---|----------|-----------|--------|
| D1 | tmux scope: global default + warning | Per-pane scope requires daemon | — Pending |
| D2 | Keychain vs machine-id file | Machine-id is simpler, keychain is more secure | — Pending |
| D3 | `ccs run claude` single-child injection | Deferred to v1.1 | — Deferred |
| D4 | SSH session forwarding | Requires more UX research | — Deferred |
| D5 | Color output | Default on, `--no-color` to disable | — Pending |
| D6 | Interactive vs non-interactive | Default non-interactive; TTY prompts on `--interactive` | — Pending |

---

## Key Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hardcoded encryption passphrase (CONCERNS #2) | 🔴 All tokens readable | Phase 1 replaces with machine-id derivation |
| Unrecoverable key on machine change (CONCERNS #3) | 🔴 All tokens lost | Phase 1: machine-id recovery warning + backup command |
| PID-based session tracking fragile | 🟠 Session confusion | Phase 2: UUID primary key |
| `started_at` dropped on update (CONCERNS #6) | 🟠 Session history unreliable | Phase 2: fix + regression test |
| `deleteStaleSessions()` never called | 🟠 Sessions accumulate | Phase 2: wire into every invocation |

---

## Decisions Log

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| `eval "$(ccs env --shell)"` pattern | Industry consensus (aws-vault, 1password-cli, direnv) | ✓ Pending |
| Machine-bound AES-256-GCM | Tokens safe at rest if disk stolen | ✓ Pending |
| Stateless CLI (no daemon) | Simpler, no pid management | ✓ Pending |
| Explicit `ccs default` | User controls startup behavior | ✓ Pending |
| Shell function for auto-activation | `ccs hook` writes function that calls `ccs env --shell` | ✓ Pending |
| UUID over PID for sessions | PIDs recycled; shell has no memory of ccs state | ✓ Pending |

---

## Phase History

| Phase | Status | Notes |
|-------|--------|-------|
| 1 | 📋 Todo | Encryption Foundation |
| 2 | 📋 Todo | Session Tracking |
| 3 | 📋 Todo | Shell Env Infrastructure |
| 4 | 🚧 Phase 4 — Plans 04-01, 04-02, 04-03 complete | CLI Parser & Command Wiring |
| 5 | 📋 Todo | Profile Lifecycle |
| 6 | 📋 Todo | Shell Integration Bootstrap |
| 7 | 📋 Todo | Default Profile & Auto-Activate |
| 8 | 📋 Todo | Visibility Commands |
| 9 | 📋 Todo | Diagnostics & Doctor |
| 10 | 📋 Todo | Backup & Restore |

---

*Last updated: 2026-04-01 after initialization*

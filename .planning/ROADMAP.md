# ROADMAP.md — ccs

## Milestones

- ✅ **v0.1 CLI Core** — Phases 1–4 (shipped 2026-04-02)
- 🚧 **v0.2 Profile Management + OAuth2** — Phases 5–6 (planned)
- 📋 **v0.3+** — Phases 7–14 (planned)

---

## ✅ Phase 1: Encryption Foundation

**Issue**: #3 — Encryption Utilities
**Goal**: Implement AES-256-GCM encryption with machine-derived key for token storage.

**Requirements**: ENC-01

**Success criteria**:
1. `Encryption.encrypt(plaintext)` returns base64 ciphertext with `v1:` prefix
2. `Encryption.decrypt(ciphertext)` round-trips correctly with no data loss
3. Encryption key derived from `~/.config/ccs/machine-id` via PBKDF2 — never hardcoded
4. First-run creates `machine-id` file with recovery warning printed to stdout
5. All `bun test` pass — including round-trip encrypt/decrypt test

**Dependencies**: None (ground floor)

---

## ✅ Phase 2: Session Tracking

**Issue**: #5 — Type Definitions and Interfaces
**Goal**: Robust per-terminal session tracking with UUID primary keys and stale cleanup.

**Requirements**: CLI-05, CLI-09

**Success criteria**:
1. `ccs sessions` lists active sessions with UUID, terminal name, profile, last activity
2. New terminals detected via TTY path or `CCS_SESSION_ID` env var fallback
3. `deleteStaleSessions()` wired — called on every `ccs` invocation (sessions >24h old pruned)
4. `started_at` preserved on `updateSession` — not overwritten by `last_activity`
5. `ccs sessions --prune` as explicit cleanup command
6. All `bun test` pass

**Dependencies**: None (uses existing sessions schema)

---

## ✅ Phase 3: Shell Env Infrastructure

**Issue**: #6 — Shell Integration Infrastructure
**Goal**: Core modules for env var output, shell integration, and switch orchestration.

**Requirements**: CLI-10

**Modules to build**:
- `src/core/session.ts` — terminal detection, UUID generation, session upsert
- `src/core/env-output.ts` — formats env vars for `--shell`, `--local`, `--persistent`
- `src/core/shell-integration.ts` — RC file patching, `.ccsrc` rewrite, marker block handling
- `src/core/switch.ts` — orchestrator: detect session → load profile → decrypt token → write env

**Success criteria**:
1. `ccs env --shell` outputs valid shell exports without printing raw token
2. `ccs env --local` writes `.env` in current directory (profile name only, not token)
3. `ccs env --persistent` rewrites `~/.ccsrc` idempotently, adds single source line to RC file
4. `ccs switch <profile> --shell` integrates with `switch.ts` and exits fast (<1s)
5. All `bun test` pass

**Dependencies**: Phase 1 (for token decryption), Phase 2 (for session detection)

---

## ✅ Phase 4: CLI Parser & Command Wiring (SHIPPED v0.1)

**Issue**: #4 — CLI Parser and Command Structure
**Goal**: Replace all Commander stub handlers with real implementations.

**Requirements**: CLI-01, CLI-02, CLI-06, CLI-07, CLI-08, CLI-10

**Plans**:
- ✅ **04-01** — Infrastructure Layer (6 files: output, init, session, env-output, shell-integration, switch)
- ✅ **04-02** — CLI Command Handlers (5 files: switch, add, remove, default, index)
- ✅ **04-03** — Read-only Commands + Tests (4 files: list, env, tests/helpers, tests/cli/all.test.ts)

**Success criteria**:
1. `ccs switch <profile>` activates profile (writes env vars via `switch.ts`)
2. `ccs switch --shell` outputs `eval`-compatible export block
3. `ccs switch --persistent` and `--local` work correctly
4. `ccs list` shows all profiles with active (`*`) and default (`(default)`) indicators
5. `ccs add --token <token> --name <name>` creates encrypted profile
6. `ccs remove <profile>` deletes profile with confirmation
7. `ccs env [profile]` outputs env vars in requested format
8. `ccs --json` flag works for all commands
9. `ccs --quiet` suppresses info output; never suppresses errors or security warnings
10. All `bun test` pass; `bun run ci` passes

**Dependencies**: Phase 3 (env infrastructure), Phase 1 (encryption)

---

## 🚧 Phase 5: Interactive `ccs add` + OAuth2 (v0.2)

**Issue**: #7 — Profile Management CRUD Operations; #8 — Manual Token Addition
**Goal**: Full interactive profile creation with OAuth2, manual token, and env-var capture paths.

**Requirements**: ADD-01–ADD-05, OAUTH-01–OAUTH-05, MANUAL-01–MANUAL-02, ENV-01–ENV-03, LIST-01

**Plans**:
- **05-01** — Interactive TTY flow in `src/cli/commands/add.ts` — auth-type selector, name prompt, base URL prompt
- **05-02** — OAuth2 path: print URL → paste code → POST exchange → retry loop on failure
- **05-03** — Manual token path: masked `@clack/prompts` input → encrypt → save
- **05-04** — Env-var path: read `$ANTHROPIC_API_KEY` → error if missing → encrypt → save
- **05-05** — `ccs list` auth method badge: `[oauth]`, `[manual]`, `[env]` per profile

**Success criteria**:
1. `ccs add` (no args) starts interactive TTY prompt — auth type → name → base URL → token capture
2. OAuth2: prints auth URL, prompts for callback code, exchanges via POST, retries on failure with "Try again?" loop
3. Manual: masked input via `@clack/prompts`, saved with `auth_method = 'manual'`
4. Env: reads `$ANTHROPIC_API_KEY`, aborts with error if unset, saved with `auth_method = 'env'`
5. `ccs list` shows badge per profile: `[oauth]`, `[manual]`, `[env]`
6. All `bun test` pass

**Dependencies**: Phase 4 (CLI wiring), Phase 1 (encryption)

---

## 🚧 Phase 6: Base URL + Switch Integration (v0.2)

**Issue**: #7 — Profile Management; #6 — Shell Integration Infrastructure
**Goal**: Per-profile base URL storage and propagation via `ANTHROPIC_BASE_URL` on switch.

**Requirements**: BASE-01–BASE-03

**Success criteria**:
1. `profiles.base_url` (nullable column) stored on profile creation and switch
2. `ccs switch <profile>` exports `ANTHROPIC_BASE_URL` env var when base URL is set (via `env-output.ts`)
3. `ccs list` shows base URL per profile — abbreviated with `…` if > 30 chars
4. `ccs switch` guards against switching to profiles with `base_url` if not supported (graceful warning)
5. All `bun test` pass

**Dependencies**: Phase 5 (profile creation), Phase 3 (env-output infrastructure)

---

## 📋 Phase 7: Profile Lifecycle

**Issue**: #7 — Profile Management CRUD Operations
**Goal**: Full profile update, validation, and remove guardrails.

**Requirements**: CLI-07, CLI-08

**Success criteria**:
1. `ccs add --update <profile>` modifies an existing profile
2. Profile validation: token format check, endpoint reachability check
3. `ccs remove <profile>` prompts for confirmation, refuses if profile is default
4. All `bun test` pass

**Dependencies**: Phase 5 (profile creation)

---

## 📋 Phase 8: Shell Integration Bootstrap

**Issue**: #8 — Shell Integration Bootstrap
**Goal**: `ccs hook` command writes shell function for seamless activation.

**Requirements**: CLI-03, CLI-06

**Success criteria**:
1. `ccs hook bash` writes bash function to stdout or file
2. `ccs hook zsh` writes zsh function
3. `ccs hook fish` writes fish function
4. Shell function calls `ccs env --shell` back on every prompt — zero manual eval needed
5. `ccs hook --install` appends to RC file idempotently (checks for existing marker block)
6. Setup UX: `ccs doctor` detects if shell hook is installed and guides user to fix
7. New shell opens with default profile active automatically
8. All `bun test` pass

**Dependencies**: Phase 6 (env output)

---

## 📋 Phase 9: Default Profile & Auto-Activate

**Issue**: #9 — Basic Switch Command
**Goal**: Explicit default management and per-terminal isolation.

**Requirements**: CLI-02, CLI-03, CLI-04, CLI-05

**Success criteria**:
1. `ccs default <profile>` explicitly sets the default profile (stored in settings table)
2. `ccs default` (no args) shows current default
3. New terminal shells activate default profile via shell hook
4. `ccs current` shows active profile for current terminal — reads `CCS_SESSION_ID` from env
5. `ccs current` reconciles DB state with shell env — warns if they disagree
6. Switching in one terminal does not affect other terminals (per-terminal isolation)
7. All `bun test` pass

**Dependencies**: Phase 8 (shell hook for auto-activate)

---

## 📋 Phase 10: Visibility Commands

**Issue**: #10 — Full list/current/sessions visibility
**Goal**: Complete visibility commands with `--json`, `--quiet` output modes.

**Requirements**: CLI-04, CLI-06, CLI-09

**Success criteria**:
1. `ccs list --show-endpoints` shows custom endpoint indicators
2. `ccs list --json` outputs valid JSON array of profiles
3. `ccs current --short` outputs single-line profile name only
4. `ccs current --json` outputs JSON with session details
5. `ccs sessions --current` shows current terminal session
6. `ccs sessions --clean` removes stale sessions interactively
7. `ccs sessions --kill <id>` kills specific session
8. All `bun test` pass

**Dependencies**: Phase 9 (sessions)

---

## 📋 Phase 11: Diagnostics & Doctor

**Issue**: #11 — Health checks and self-repair
**Goal**: `ccs doctor` with automated fix and migration capabilities.

**Requirements**: CLI-01 (error handling), CLI-10

**Success criteria**:
1. `ccs doctor` checks: encryption health, DB integrity, shell hook installed, default profile set, session staleness
2. `ccs doctor --fix` auto-fixes: reinstalls shell hook, clears stale sessions, sets default if missing
3. `ccs doctor --migrate-encryption` re-encrypts with new PBKDF2 params if version bump needed
4. `ccs doctor --export-encrypted-backup` creates portable encrypted backup
5. Exit codes: 0=healthy, 1=issues found, 2=invalid args, 4=encryption error
6. All `bun test` pass

**Dependencies**: Phase 10 (full CLI)

---

## 📋 Phase 12: Backup & Restore

**Issue**: #12 — Export Profiles to JSON
**Goal**: Portable encrypted export/import with password wrapping.

**Requirements**: CLI-10 (backup/restore parts)

**Success criteria**:
1. `ccs export [file]` exports all profiles to JSON
2. `ccs export --encrypt` wraps export with password-based encryption (independent of machine key)
3. `ccs import <file>` imports profiles from JSON or encrypted JSON
4. `ccs import` detects duplicate profiles and prompts for overwrite/skip/rename
5. `ccs backup` / `ccs restore` as shortcuts for default export/import paths
6. Backup/restore are machine-local by default (documented clearly)
7. All `bun test` pass

**Dependencies**: Phase 11 (doctor diagnostics)

---

## 📋 Phase 13: Token Management (Refresh + Re-auth)

**Issue**: #14 — Token Refresh
**Goal**: Silent token refresh and graceful re-auth on expiration.

**Requirements**: REFR-01–REFR-03

**Success criteria**:
1. `ccs switch <profile>` silently refreshes expired access token if refresh token exists
2. Refresh token stored in `profile.metadata` (encrypted in metadata JSON blob)
3. Re-auth prompt if refresh token is also expired (user must re-run `ccs add --update`)
4. All `bun test` pass

**Dependencies**: Phase 7 (profile lifecycle), Phase 5 (OAuth2 exchange)

---

## 📋 Phase 14: Advanced Shell Integration

**Issue**: #8 — Shell Integration; #13 — Security Hardening
**Goal**: Per-pane scope, `ccs run`, and security hardening.

**Requirements**: SHEL-03, SHEL-04, SHEL-05

**Success criteria**:
1. `ccs current` shows active profile in current terminal
2. `ccs sessions` lists active terminal sessions
3. `ccs run <profile> <cmd>` injects profile env into single child process without persisting to shell
4. All `bun test` pass

**Dependencies**: Phase 9 (auto-activate)

---

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLI-01: switch activates profile | 4 | ✅ Shipped v0.1 |
| CLI-02: explicit default | 4, 9 | ✅ Wired in Phase 4; full in Phase 9 |
| CLI-03: new terminals auto-activate | 9 | 📋 |
| CLI-04: current shows active profile | 9 | 📋 |
| CLI-05: per-terminal isolation | 2, 9 | 📋 |
| CLI-06: list with indicators | 4, 10 | ✅ Wired in Phase 4; full in Phase 10 |
| CLI-07: add profile | 4, 5 | ✅ Wired in Phase 4; full in Phase 5 |
| CLI-08: remove profile | 4, 7 | ✅ Wired in Phase 4; full in Phase 7 |
| CLI-09: sessions command | 2, 10 | 📋 |
| CLI-10: env output | 3, 4 | ✅ Shipped v0.1 |
| ENC-01: AES-256-GCM encryption | 1 | ✅ Shipped v0.1 |
| ADD-01–ADD-05: interactive add | 5 | 🚧 Planned v0.2 |
| OAUTH-01–OAUTH-05: OAuth2 flow | 5 | 🚧 Planned v0.2 |
| MANUAL-01–MANUAL-02: manual token | 5 | 🚧 Planned v0.2 |
| ENV-01–ENV-03: env var path | 5 | 🚧 Planned v0.2 |
| BASE-01–BASE-03: base URL | 6 | 🚧 Planned v0.2 |
| LIST-01: auth method badge | 5 | 🚧 Planned v0.2 |
| REFR-01–REFR-03: token refresh | 13 | 📋 |
| SHEL-03/04/05: shell hook | 14 | 📋 |

**Coverage**: 9/30 requirements shipped. v0.2: 16 requirements in Phases 5–6.

---

## Open Decisions

| # | Decision | Status |
|---|----------|--------|
| D1 | tmux per-pane scope vs global (default to global + warning) | — Pending |
| D2 | Keychain vs machine-id file for key derivation | — Pending (Phase 1) |
| D3 | `ccs run claude` single-child injection for security | — Deferred to Phase 14 |
| D4 | `ccs env --ssh-inject` for remote sessions | — Deferred |
| D5 | CLI color output vs plain text | — Pending |
| D6 | Interactive TTY prompts vs non-interactive | — **Resolved: interactive by default, --non-interactive flag for scripting** |
| D7 | OAuth2 redirect: local server vs manual code paste | — **Resolved: manual code paste — no local server** |
| D8 | PKCE required for Anthropic OAuth2 | — **Resolved: not required for this use case** |

---

*Generated: 2026-04-01 via /gsd:new-project | Updated: 2026-04-02 after v0.1 milestone | v0.2 phases added 2026-04-02*

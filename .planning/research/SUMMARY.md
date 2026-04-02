# Research Synthesis — `ccs` (Claude Code Swap)

**Synthesized from**: STACK.md · FEATURES.md · ARCHITECTURE.md · PITFALLS.md
**Date**: 2026-04-01
**Audience**: Implementation planning for all phases

---

## 1. What ccs Is and Where It Fits

`ccs` is a stateless CLI for managing Claude API key profiles — switching between them, keeping tokens encrypted at rest, and activating the right one per terminal. No daemon. No GUI. SQLite + AES-256-GCM.

**Competitive position**: No existing tool manages Claude API keys with per-terminal isolation and machine-bound encryption. aws-vault is AWS-only. direnv has no credential storage. ccs occupies a defensible, underserved niche.

---

## 2. Core Technical Decision — Shell Integration

### The Pattern

The 2025 de facto standard for CLI key managers is **`eval` output** — the tool prints `export` statements to stdout, and the user's shell evaluates them. Used by 1password-cli, aws-vault, gcloud, az, direnv, and doctl.

```
ccs switch work --shell
  → prints: export ANTHROPIC_AUTH_TOKEN="sk-ant-..."
  → user runs: eval "$(ccs switch work --shell)"
```

`ccs` must support **three activation modes** (already typed in the codebase):

| Mode | Mechanism | Scope |
|------|-----------|-------|
| `--shell` | `eval "$(ccs env --shell)"` | Current shell only, stateless |
| `--persistent` | Rewrite `~/.config/ccs/ccs-activate.sh`, source from `~/.bashrc` | All future shells |
| `--local` | Write `.env` to cwd | Current project directory |

**Key implementation rule for `--persistent`**: Never append to `~/.bashrc`. Write a dedicated file and add a single idempotent `source` line to the RC. Rewrite the dedicated file on every switch. This prevents the accumulation of duplicate exports (PITFALL 1.2).

### Shell Function Bootstrap (Recommended User Setup)

```bash
# ~/.bashrc — one-time setup:
eval "$(ccs hook bash)"

# ccs hook bash outputs:
_ccs_env() { eval "$(ccs env --shell)"; }
_ccs_env
```

New shells call `ccs env --shell` at startup, decrypt the default profile from SQLite, and export it — no secrets written to disk.

### Env Vars to Set

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_AUTH_TOKEN` | **Yes** | Primary. What Claude reads. |
| `ANTHROPIC_API_KEY` | No | Legacy alias; SDK checks it second. Write both for safety. |
| `ANTHROPIC_BASE_URL` | No | Custom endpoint (proxy, self-hosted). |
| `_CCS_PROFILE` | Recommended | Written by ccs; readable by `ccs current`. |
| `_CCS_SESSION_ID` | Recommended | Written by ccs; DB cross-reference. |

**Token masking**: Never echo token values to stdout. Print `sk-ant-••••••••` in previews. `--reveal` flag triggers a 3-second countdown warning before clipboard copy.

---

## 3. Session Tracking — How It Works

### The Abstraction

Each terminal pane has one row in the `sessions` table. The CLI identifies panes via `$TTY` (primary) or a composite PID+PPID key (tmux/headless fallback).

```
Shell starts
  → ccs current / ccs switch (auto)
    → detectTerminalSessionId() → "ttys003" or "$TMUX socket + pane index"
    → No row → INSERT; Row exists → UPDATE last_activity
    → Inject env vars via eval
Another pane (ttys005) → isolated row
```

### Terminal Detection Strategy

```
1. Read $TTY (device path)       → most reliable for direct terminals
2. Fall back to $TMUX socket path → tmux panes
3. Fall back to $TERM_SESSION_ID  → macOS Terminal / iTerm2 proprietary
4. Fall back to PID + PPID composite
```

Use a UUID as the primary session identifier (not PID alone). Store PID as metadata. This prevents PID recycling from creating false session mappings (PITFALL 3.1).

### Active Profile: Tool State vs. Shell State

`ccs current` must show **both**:
1. What `ccs` last wrote (`_CCS_PROFILE` env var)
2. What the sessions table records for this terminal

If they disagree → print a prominent warning: *"Shell may not have loaded latest profile."*

### Stale Session Cleanup

`deleteStaleSessions()` exists in `storage.ts` but is never called. Wire it in:
- Run on every `ccs` invocation (lightweight DELETE with index on `last_activity`)
- Also expose as `ccs sessions --prune`
- Also fix `started_at` dropping bug in `updateSession()` — add to UPDATE SET clause or use `COALESCE(excluded.started_at, started_at)` (CONCERNS #6)

---

## 4. Feature Priority Map

### Table Stakes (Must Have — Phase 1)

| Feature | Implementation |
|---------|---------------|
| `ccs switch <profile>` | Core: decrypt + print exports |
| `ccs list` | Profile visibility |
| `ccs current` | Active profile (env var + DB) |
| `ccs add` / `ccs remove` | Profile lifecycle |
| `ccs env --shell` | The mechanism everything else depends on |
| `ccs default <profile>` | Settings table write/read |
| `ccs sessions` | Per-terminal tracking |
| Token encrypted at rest | AES-256-GCM scaffolding exists |

### Differentiators (Phase 2–3)

| Feature | Rationale | Complexity |
|---------|-----------|------------|
| `.ccsrc` workspace auto-switch | direnv-style "cd into project → correct profile" | MED |
| `ccs env --reveal` | Debug token without peeking at Claude config | LOW |
| Profile health / doctor | Detect expired tokens, network issues before Claude run | MED |
| Backup / restore | Mitigate key-loss blast radius | MED |
| Shell completions | Profile names at `ccs switch <TAB>` | LOW |
| `ccs env --copy` | Clipboard for users who skip shell hooks | LOW |
| Profile tags + filtering | `ccs list --tag work` for 10+ profiles | LOW |
| `ccs init --direnv` | Generate `.envrc` for direnv ecosystem | LOW |

### Anti-Features (Explicitly Out of Scope)

- Background daemon (contradicts stateless design)
- Cross-machine profile sync (defeats machine-bound security model)
- GUI or web interface
- Profile rotation / load balancing
- Per-request quota enforcement

---

## 5. Phased Build Order

```
Phase 1 — Core mechanism, unblock daily use
  1. encryption.ts (decryptSync)          ← required by everything below
  2. ccs env --shell                      ← the eval mechanism
  3. ccs switch --shell                   ← prove the mechanism
  4. ccs list / ccs current              ← visibility
  5. ccs hook bash / zsh / fish           ← shell bootstrap scripts
  6. Session registration on shell init  ← wire deleteStaleSessions()
  7. ccs default                          ← settings table
  8. ccs switch --persistent             ← RC file + dedicated activate.sh
  9. ccs switch --local                  ← .env write + .gitignore nudge

Phase 2 — Encryption rework + security hardening
  10. Dedicated machine-id file           ← stabilize key derivation
  11. ccs doctor                          ← token validation, machine-key check
  12. Backup / restore                    ← password-wrapped export envelope
  13. ccs doctor --migrate-encryption    ← PBKDF2 v1→v2 re-encryption
  14. OS keychain integration             ← platform-specific (Keychain, GNOME, KWallet)

Phase 3 — Polish and TUI
  15. Shell completions
  16. ccs sessions --prune
  17. ccs env --copy / --reveal
  18. TUI (SwitchScreen.ts)                ← only after all TS commands stable
```

---

## 6. Critical Pitfalls to Prevent

### 🔴 Phase 1 — Must Fix or Design Around

| # | Pitfall | Prevention |
|---|---------|-----------|
| 1.1 | `eval` requirement not communicated; silent failure | Default `--shell` output requires `eval`; detect non-eval usage and warn loudly |
| 1.2 | `.bashrc` accumulates duplicate exports on every `--persistent` | Write dedicated `ccs-activate.sh`; add one idempotent `source` line to RC |
| 1.3 | Subshell / script invocation silently fails | Document supported invocation patterns; print warning in TTY sessions |
| 2.2 | Scrollback captures plaintext tokens on first export | Never echo token values to stdout; use clipboard for reveal |
| 3.1 | PID-based session tracking breaks on fork/recycle | Use UUIDs as primary identifiers; PID as metadata only |
| 5.2 | `ccs env` raw token exposure without guards | `--shell` prints exports but not raw tokens; `--show-token` required for raw output |
| 4.1 | Key loss on any machine change is total | Dedicated `~/.config/ccs/machine-id` file; one-time recovery warning on first run |
| 4.5 | No key recovery if machine-id is lost | `ccs recover --from-backup`; master-password fallback via `Bun.passwordSync` |

### 🟡 Phase 1 — Important, Lower Severity

| # | Pitfall | Prevention |
|---|---------|-----------|
| 1.4 | tmux/screen multiplexer not tracked | Detect `$TMUX`/`$STY`; log pane ID in session metadata; warn on global scope |
| 1.5 | `.ccsrc` precedence undefined | Explicit: `--local` → `--persistent` → `default`; `--no-local` flag |
| 2.3 | Terminal title bars expose token values | Never allow token in prompt vars; warn if detected |
| 2.4 | SSH sessions don't propagate token | `ccs env --ssh-inject` for remote use; document remote behavior |
| 3.2 | No session record for pre-existing shells | `ccs doctor --register-sessions` scans `/proc` for existing shells |
| 3.3 | `deleteStaleSessions()` never called | Wire into every `ccs` invocation |
| 3.4 | `started_at` dropped on `updateSession` | Add `COALESCE(excluded.started_at, started_at)`; add CI test |
| 3.5 | Multiplexer pane lifecycle not tracked | Query `tmux list-panes`; mark sessions stale if pane gone |
| 4.2 | Key derivation diverges between encrypt/decrypt | Single `Encryption._getKey()` internal method; round-trip test |
| 4.3 | Machine-bound key doesn't protect same-machine attacker | Document explicitly; pair with OS keychain for improved posture |
| 4.4 | PBKDF2 params not versioned; no migration | Version prefix on ciphertext (`v1:${...}`); `ccs doctor --migrate-encryption` |
| 4.6 | Backup/restore not portable across machines | Password-wrapped export format; document machine-local limitation |
| 5.1 | "Implied active" illusion | Show both `_CCS_PROFILE` env var and DB session state in `ccs current` |
| 5.3 | No exit code conventions | Define 0–7 codes (see below); print human-readable message on stderr |
| 5.4 | `--quiet` suppresses security warnings | Two-tier output: `--quiet` suppresses info only; `--silent` suppresses all including warnings |

### Exit Codes to Define

```
0   — success
1   — general error
2   — invalid arguments
3   — profile not found
4   — encryption / decryption failed
5   — database error
6   — shell integration not configured
7   — session not found
```

---

## 7. New Components Required

```
src/
├── core/
│   ├── session.ts          # detectTerminalSessionId(), upsertSession(), stale cleanup
│   ├── env-output.ts       # format exports for --shell / --persistent / --local targets
│   ├── shell-integration.ts # RC patching, .env writing, shell hook script output
│   └── switch.ts           # orchestrates: session + profile lookup + injection
```

**Build order**: `session.ts` → `env-output.ts` → `shell-integration.ts` → `switch.ts` → command wrappers.

---

## 8. Open Questions

| # | Question | Recommended Answer |
|---|----------|-------------------|
| 1 | How should `ccs switch` behave inside tmux — per-pane or global? | Global with warning; true per-pane isolation requires a daemon |
| 2 | Should `ccs env --shell` detect non-`eval` usage and warn? | Yes — print a loud warning when stdout is not a tty or pipe |
| 3 | Machine-id file or OS keychain for key wrapping? | Keychain is better security posture; machine-id file is simpler v1. Defer keychain to Phase 2. |
| 4 | Should `ccs run claude` exist as single-child injection? | Yes — pipe token to one child process only; avoids persistent env var; Phase 2+ |
| 5 | What idempotent marker format for RC patching? | `CCS:START` / `CCS:END` block with one `source ~/.config/ccs/ccs-activate.sh` inside |
| 6 | Should `ccs env` default to masked output? | Yes; `--show-token` flag required; `--reveal` for clipboard with countdown |

---

## 9. Security Posture Summary

`ccs` protects against: **tokens stolen from DB on disk** (AES-256-GCM + machine-bound key).

`ccs` does **not** protect against:
- Processes reading `/proc/PID/environ` on the same machine
- A live-machine attacker who can re-derive the machine key
- Tokens captured in scrollback, terminal title bars, or screenshots
- Machine changes that destroy the derived key (no recovery without backup)

**Improvement path**: OS keychain wrapping (Phase 2) raises the bar — attacker needs interactive keychain unlock, not file read.

---

*Sources: aws-vault (ByteNess fork), 1password-cli, direnv, gcloud SDK, chezmoi + SOPS, awsume, Anthropic SDK documentation*

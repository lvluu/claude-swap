# Pitfalls — CLI API Key Managers

> Research: pitfalls specific to CLI-based API key managers, shell integration, env var security,
> terminal session tracking, and machine-bound encryption key management.
> Audience: `ccs` (claude-swap) implementation — Bun/Commander.js, stateless CLI, SQLite + AES-256-GCM.
> Sources: existing CONCERNS.md, architectural decisions, domain knowledge.

---

## 1. Shell Integration

### 1.1 "eval $(ccs switch X)" is the only reliable cross-shell pattern — but users get it wrong

**The mistake**: Developers implement `--shell` as a standalone invocation that prints exports to stdout, then forget that setting a variable in a subprocess does not affect the parent shell:

```bash
ccs switch work         # WRONG: runs in subprocess, parent shell unaffected
ccs switch work --set   # WRONG: same subprocess problem
```

**Correct pattern** (but easy to misuse):
```bash
eval "$(ccs switch work --shell)"   # eval is required
```

**What goes wrong**: Tools that print exports without prominently documenting the `eval` requirement cause permanent user frustration. The `ccs switch` command succeeds silently; the token never changes. The user blames Claude Code.

**Prevention**:
- Default `--shell` output must require `eval`. Treat unevaluated output as a no-op.
- Detect non-eval usage: print a loud warning when stdout is not piped to `eval`.
- Provide shell-specific setup instructions (bash, zsh, fish) rather than a generic shell snippet.
- Never silently succeed when the shell integration won't work — fail with guidance.

**Phase**: Phase 1 (CLI-01 / CLI-03)

---

### 1.2 `.bashrc` / `.zshrc` persistence writes cause double-sourcing and slow shell startup

**The mistake**: `ccs switch --persistent` appends to `.bashrc`:
```bash
export ANTHROPIC_AUTH_TOKEN="sk-ant-..."
```

Over time, each `ccs switch` appends another line. `.bashrc` accumulates duplicate exports, comment cruft, or stale tokens. Shell startup slows. Token values multiply in unexpected ways.

**Prevention**:
- `--persistent` should write a dedicated file (`.ccsrc`, `ccs.env`) and add a **single** source line to `.bashrc`:
  ```bash
  # In .bashrc — exactly once:
  [ -f ~/.ccsrc ] && source ~/.ccsrc
  ```
- On every `ccs switch --persistent`, **rewrite** `~/.ccsrc` entirely — do not append.
- Guard against multiple source-line insertions: check before writing, idempotently.

**Phase**: Phase 1 (CLI-03)

---

### 1.3 Subshell and background process isolation is not the user's problem to debug

**The mistake**: `ccs` assumes a simple parent-shell model. In practice:

```bash
# Running inside a script or subshell — parent shell unchanged
bash -c 'ccs switch work && claude'   # claude inside subshell gets token; parent shell doesn't
(git filter-branch ...)                # subshells don't propagate ccs state
```

The tool silently fails to affect the user's interactive context.

**Prevention**:
- Document clearly which invocation patterns are supported.
- In TTY sessions, prefer writing to a **process-local** target (e.g., `~/.ccsrc` sourced at shell startup) rather than trying to mutate a running shell.
- Consider a `ccs env` command that always prints the current env block so users can verify what `ccs` believes is active.

**Phase**: Phase 1 (CLI-01, CLI-04)

---

### 1.4 Multiplexer blindness (tmux, screen, byobu)

**The mistake**: `ccs sessions` tracks sessions via PID and `started_at`, but inside tmux/screen:
- A "terminal session" in the sessions table may correspond to an inner tmux pane, not the outer terminal
- Pane/window reattaches change the visible context but not the underlying shell PID
- `ccs switch work` in one tmux window changes `~/.ccsrc`, affecting all windows sharing that config file

The sessions table's notion of "session" does not map to tmux's panes and windows.

**Prevention**:
- Detect tmux/screen by `$TMUX` / `$STY` environment variables.
- For multiplexers, log the multiplexer identity (pane ID, window name) in `session.metadata` alongside PID.
- Treat each tmux window as an independent session boundary; warn if a single `~/.ccsrc` file serves multiple active multiplexer panes.
- `ccs switch` inside tmux should either scope to the current pane (hard without daemon) or scope globally with a prominent warning.

**Phase**: Phase 1 (CLI-05, CLI-09) — Session tracking in existing schema; multiplexer handling is a new requirement

---

### 1.5 Per-workspace `.ccsrc` overrides conflict with global state

**The mistake**: `ccs` plans to support `.ccsrc` per workspace. If `ccs switch work` writes global `~/.ccsrc` and a project also has `.ccsrc`, which wins?

Worse: `ccs switch` in the project directory silently writes `~/.ccsrc`, not `./.ccsrc`. The user expects workspace isolation but gets global behavior. Or vice versa.

**Prevention**:
- Define explicit precedence: `--local` → `--persistent` → `default` profile (from settings table).
- Make `.ccsrc` workspace detection automatic but overridable (`--no-local`, `--global`).
- When both files exist, print a one-time notice about which file is active.
- Never silently fall back from `--local` to global.

**Phase**: Phase 1 (CLI-01, CLI-02)

---

## 2. Environment Variable Security

### 2.1 `/proc/PID/environ` exposes all exported tokens

**The mistake**: After `ccs switch`, the token lives in `ANTHROPIC_AUTH_TOKEN` in the shell's environment. Any process with read access to that PID can inspect:

```bash
cat /proc/$$/environ | tr '\0' '\n' | grep ANTHROPIC
```

This is true for: `ps eww`, `/proc/*/environ`, debugger attach, `strace`, `env` in any child process.

**What this means for `ccs`**: Shell integration via `export` is **inherently leaky**. The security model (AES-256-GCM at rest) protects the DB; it does not protect the live token in memory.

**Mitigation** (not elimination):
- Document that `ccs switch` exports tokens to the shell environment and this is intentionally observable by local processes.
- For high-security use cases, recommend a wrapper that injects the token only to the `claude` subprocess (e.g., `ccs run claude` — pipes token to a single child, no persistent env var).
- Never write tokens to world-readable locations (see CONCERNS.md #10 — `/tmp` fallback is a critical issue).

**Phase**: Phase 2 or later — `ccs run` subcommand

---

### 2.2 Scrollback buffer captures tokens on first export

**The mistake**: When `ccs switch` prints:
```
✅ Switched to 'work' profile
export ANTHROPIC_AUTH_TOKEN="sk-ant-..."
```

The shell's scrollback buffer now contains the plaintext token. The user runs `history | grep ANTHROPIC` or scrolls up. The token is in the scrollback indefinitely.

**Prevention**:
- When using TTY prompts or printing env vars for `eval`, **never echo the token value**. Print only the profile name:
  ```
  ✅ Switched to 'work' profile
  # Token active — not displayed
  ```
- If printing for `--copy`, use the clipboard directly (`Bun.write('/dev/clipboard', value)`) instead of stdout.
- In TUI screens, never render token values in the preview pane unless the user explicitly requests it and the context is secure.

**Phase**: Phase 1 (CLI-01, CLI-10)

---

### 2.3 Terminal window titles and name tags leak tokens

**The mistake**: Terminal emulators (iTerm2, GNOME Terminal, etc.) sometimes set the window title from shell prompts. If the prompt is configured to show `$ANTHROPIC_AUTH_TOKEN` or a derived value (e.g., current profile name), the token appears in:
- The terminal window title bar
- Task switchers (Alt+Tab, Cmd+Tab)
- Screenshot tools
- Screen sharing

**Prevention**:
- Never allow the token value to appear in shell prompt variables.
- Document that profile names (not token values) are safe for prompt integration.
- Warn if `ccs switch` detects a prompt that references `ANTHROPIC_AUTH_TOKEN`.

**Phase**: Phase 1 (CLI-01)

---

### 2.4 SSH and remote sessions don't propagate token state

**The mistake**: User switches to `work` locally, then `ssh user@host 'claude'`. The remote shell has no knowledge of the local `ccs` state. The remote `claude` either uses the host's own `ccs` default or has no token at all.

This creates a confusing UX: switching "worked" locally but `claude` fails remotely.

**Prevention**:
- Document the remote session behavior explicitly.
- Provide `ccs env --export-base64` for users who want to carry env blocks over SSH:
  ```bash
  ssh user@host "$(ccs env --ssh-inject)"
  ```
- Consider a `--forward` flag that emits SSH command wrappers.

**Phase**: Phase 2 or later — remote session support

---

## 3. Terminal Session Tracking

### 3.1 PID-based session tracking is fragile across fork/exec cycles

**The mistake**: The sessions table tracks `pid` and uses it to identify "which shell this session belongs to." But:

- Shells fork child processes for every command; the PID being tracked is the shell's PID
- Interactive shells may `exec` a new process in place (PID unchanged)
- tmux/screen reparent processes, breaking PID-to-session mappings
- PIDs are **recycled** by the OS after process exit — a new process can acquire the same PID as a previous session

**Prevention**:
- Use **UUIDs** as primary session identifiers, generated fresh on session creation. Store the UUID in the shell's environment (`CCS_SESSION_ID`) at startup.
- Track PID as **metadata**, not as a foreign key or primary identifier.
- On every `ccs` invocation, read `CCS_SESSION_ID` from the environment if present; fall back to PID as a heuristic.
- `started_at` timestamp provides disambiguation when PIDs collide.

**Phase**: Phase 1 (CLI-03, CLI-05) — sessions schema already exists; PID → UUID migration needed

---

### 3.2 "Session created" events are never fired for existing shells

**The mistake**: `ccs sessions` relies on a session being created when a new shell starts. But:
- The user already has three open terminals before installing `ccs`
- `ccs` is never invoked at those shells' startup, so no session records exist
- `ccs sessions` shows nothing; `ccs current` shows nothing; the user is confused

**Prevention**:
- `ccs doctor` should detect existing shells (by scanning `/proc` for shells associated with the user) and offer to register them.
- `ccs sessions --sync` (or `ccs doctor --register-sessions`) creates session records for existing shells on demand.
- On first run, guide the user through shell setup and existing session registration.

**Phase**: Phase 1 (CLI-03, CLI-09)

---

### 3.3 Stale session records are never cleaned up — but cleanup is defined and never called

**CONCERNS.md #4 already flags this.** The gap: `deleteStaleSessions()` exists in `storage.ts` but is never invoked. Sessions accumulate indefinitely. Over months/years, the sessions table grows stale records that are confusing in `ccs sessions` output.

**Prevention**:
- Wire `deleteStaleSessions()` into a **lazy cleanup**: call it on every `ccs` invocation when the last activity is older than a threshold (e.g., clean sessions older than 24h on each invocation).
- Add `ccs sessions --prune` as an explicit cleanup command.
- When listing sessions, always exclude records older than the staleness threshold.

**Phase**: Phase 1 (CLI-09) — wire existing function

---

### 3.4 `started_at` is dropped on `updateSession` (CONCERNS.md #6)

**CONCERNS.md #6 already flags this bug.** `started_at` should be preserved; `last_activity` should be updated. The current `UPDATE` omits `started_at`, making session duration tracking unreliable.

**Prevention**: Add to CI — write a test that asserts `started_at` is stable across `updateSession` calls.

**Phase**: Phase 1 (CLI-09)

---

### 3.5 Terminal multiplexer pane/window lifecycle is not tracked

**The mistake**: tmux windows can be closed and reopened. Screen panes detach. The sessions table records the PID at creation but does not track whether that shell is still alive.

Reading `/proc/{pid}` for liveness is unreliable inside containers, across privilege boundaries, and with PID recycling.

**Prevention**:
- For tmux: query `tmux list-windows` / `tmux list-panes` to get live pane IDs; mark sessions as stale if their pane no longer exists.
- For screen: query `screen -ls`.
- For plain terminals: use the existing PID heuristic with a short staleness window (5 minutes without `last_activity` update → mark stale).
- Never rely solely on PID liveness checks.

**Phase**: Phase 1 (CLI-09) — multiplexer support

---

## 4. Machine-Bound Encryption Key Management

### 4.1 The single most catastrophic failure mode: key loss is total

**The mistake**: Machine-bound encryption means **the key is irrecoverable by design** if the derivation inputs change. This is the central risk of the entire security model:

- CPU upgrade → `cpus().length` changes → all tokens gone
- OS reinstall → `/etc/machine-id` regenerated → all tokens gone
- VM clone/snapshot restore → new machine identity → all tokens gone
- Home directory rename → `homedir` hash changes → all tokens gone
- Running in Docker/VM without stable `/etc/machine-id` → unpredictable key changes

CONCERNS.md #3 already identifies this as critical. The real-world consequence: any routine hardware upgrade **destroys all stored tokens without warning**.

**Prevention — key derivation inputs must be stable**:
1. **Dedicated machine-id file** (`~/.config/ccs/machine-id`) — generated once at install time, never changes unless explicitly re-initialized
2. **Do not include transient data** in the fingerprint: CPU count, hostname, arch, CPU count — all of these change
3. **Include at least one stable, user-controlled identifier**: the machine-id file is the right anchor
4. On first run, print a **one-time recovery warning**: "Write down this machine ID. If you reinstall your OS or move to a new machine, your tokens cannot be recovered."
5. Provide a `ccs doctor --export-encrypted-backup` that stores an encrypted export alongside the machine-id file, so the user has an offline recovery path

**Phase**: Phase 2 (encryption rework) — directly addresses CONCERNS #2 and #3

---

### 4.2 The key derivation algorithm is duplicated between encrypt and decrypt paths

**The mistake**: If `deriveKey()` is implemented as a standalone function and called identically in `encrypt()` and `decrypt()`, there's a risk of future divergence — someone adds a step to encryption but forgets decryption. Or vice versa.

With a hardcoded passphrase (CONCERNS.md #2), this is less visible because the failure mode is consistent. But once the key is properly derived from a machine-id file, divergence would cause **silent data corruption** on decrypt.

**Prevention**:
- Key derivation lives in exactly one place: `Encryption.deriveMachineKey()` — a private method called internally.
- `encrypt()` and `decrypt()` both call `this._getKey()` which memoizes the derived key for the instance lifetime.
- Write a test that encrypts then immediately decrypts and asserts round-trip equality — this catches any divergence in the derivation pipeline.

**Phase**: Phase 2

---

### 4.3 No protection against key theft on the same machine

**The mistake**: `ccs` uses machine-bound encryption. If an attacker gains code execution on the same machine, they can:
1. Read `~/.config/ccs/machine-id` (if using that approach)
2. Re-derive the encryption key using the same PBKDF2 parameters
3. Decrypt every token in `~/.config/ccs/data.db`

The machine-bound key does not protect against same-machine compromise. This is a fundamental limitation, not a bug.

**Prevention**:
- Document this explicitly in the security model. The protection `ccs` offers is: **tokens at rest are safe if the disk is stolen**. It does not protect against a live-machine attacker.
- For high-security environments, recommend pairing `ccs` with OS-level full-disk encryption and keychain integration (the planned but unimplemented OS keychain feature).
- If OS keychain is used to store the machine-id or a wrapping key, the security posture improves significantly (attacker needs interactive keychain unlock, not file read).

**Phase**: Phase 2 or later — keychain integration

---

### 4.4 PBKDF2 parameters are not configurable and not stored with ciphertexts

**The mistake**: Iterations, salt length, key length, and digest algorithm are all hardcoded constants in `encryption.ts`. If a future security advisory recommends increasing iterations (e.g., from 100K to 600K for PBKDF2-SHA512), there is **no migration path**:

- Existing ciphertexts were derived with the old parameters
- New encryptions use new parameters
- `decrypt()` has no parameter metadata to know which params to use

**Prevention**:
- Include a **version prefix** in the ciphertext format: `v1:${base64(iv ‖ tag ‖ ct)}`.
- When decrypting, parse the version prefix and use the corresponding parameter set.
- When a parameter migration is needed (v1 → v2), write a **re-encryption migration**: decrypt with old params, re-encrypt with new params, update the version prefix. Provide `ccs doctor --migrate-encryption` to run it.
- Store the PBKDF2 salt **per-record** (already implied by random IV, but verify the salt is stored, not shared).

**Phase**: Phase 2

---

### 4.5 Key recovery path is missing entirely

**The mistake**: If the machine-id file is lost or corrupted, every token is permanently unreadable. The user has no recovery path. This is the single worst UX failure mode for a credential manager.

**Prevention**:
- On first install, prompt the user: "Store this backup phrase: `<machine-id>`" — give it a human-readable name.
- Provide a `ccs recover --from-backup <machine-id>` command that re-initializes the machine key from a backed-up ID.
- Warn if `~/.config/ccs/machine-id` appears to be missing on a subsequent run — offer recovery mode before any token operations.
- Consider a master-password fallback (Bun.passwordSync) so users who lose machine-id can still access tokens via a memorized password.

**Phase**: Phase 2

---

### 4.6 Backup/restore operations must re-encrypt the DB

**The mistake**: A naive `cp ~/.config/ccs/data.db /backup/` backs up the encrypted database. This is fine for disaster recovery of the machine — the key is also in `~/.config/ccs/machine-id`. But if the user moves the backup to a new machine (or a VM clone), the fingerprint changes and the backup becomes unreadable alongside the live DB.

**Prevention**:
- Document clearly that `ccs backup` / `ccs restore` are **machine-local** operations.
- If cross-machine restore is needed (e.g., hardware failure with exact machine-id restored), provide `ccs restore --machine-id=<id> --source=/path/to/backup`.
- Consider an encrypted export format (`ccs export --encrypt-with-password`) that wraps the token in a password-encrypted envelope independent of machine key — this gives users a portable backup they can restore anywhere (CONCERNS.md #7 flags the plaintext token export type; this is the resolution).

**Phase**: Phase 1 (CLI-10 export/import)

---

## 5. General CLI Credential Manager Pitfalls

### 5.1 The "implied active profile" illusion

**The mistake**: `ccs current` shows which profile the tool thinks is active. But `ccs` has no way to know whether the user's shell has actually evaluated the latest `~/.ccsrc`. If the user:
1. Runs `ccs switch work`
2. Does not restart their shell
3. Runs `ccs current` in a new terminal tab

Both terminals may disagree. `ccs current` reads from the settings table or a state file — it does not read the live shell's environment.

**Prevention**:
- `ccs current` should show **two things**: the profile `ccs` last wrote (`~/.ccsrc` modification time + content) AND, if `CCS_SESSION_ID` is set, the profile associated with that session in the DB.
- If the two disagree, print a prominent warning: "Shell may not have loaded latest profile."
- `ccs switch` should always confirm by printing the effective profile immediately after writing.

**Phase**: Phase 1 (CLI-01, CLI-04)

---

### 5.2 `ccs env` output includes the raw token unless explicitly guarded

**The mistake**: `ccs env` (CONCERNS.md: CLI-10) prints env vars for shell integration. If `--shell` or `--copy` is not specified, the default behavior should **not** print the raw token to stdout. But in a TTY, the temptation is to print the token in the preview pane for verification.

**Prevention**:
- `ccs env` never prints tokens to stdout unless `--show-token` is passed.
- The TUI preview pane should use a masked display (`sk-ant-••••••••••••`) by default, with a "reveal" toggle.
- Clipboard copy should not echo the value to stdout.

**Phase**: Phase 1 (CLI-10)

---

### 5.3 Exit code conventions are not established

**The mistake**: CLI tools for credential management often return `0` for "success" even when the operation didn't do what the user expected (e.g., `ccs switch work` returns 0 but the shell never evaluated the output). Or they return non-zero for expected states (profile not found).

**Prevention**:
- Define and document exit codes:
  ```
  0   — success
  1   — general error
  2   — invalid arguments
  3   — profile not found
  4   — encryption/decryption failed
  5   — database error
  6   — shell integration not configured
  7   — session not found
  ```
- `ccs switch` returns 6 if shell integration is not configured, with a message directing the user to run `ccs doctor`.
- All non-zero codes must have a human-readable message printed to stderr before exiting.

**Phase**: Phase 1 (CLI-01 — error handling in command handlers)

---

### 5.4 `--quiet` flag suppresses critical security warnings

**The mistake**: If `--quiet` suppresses all output, the user never sees:
- A warning that their shell hasn't evaluated the latest profile
- A warning that the target profile is expired or the token looks malformed
- A warning that the machine-key has changed and tokens may be unrecoverable

**Prevention**:
- Define **two output tiers**:
  - `--quiet` suppresses informational output (profile list, spinner, success confirmations)
  - `--silent` (or `-s`) suppresses everything including warnings
- Security warnings always print to stderr regardless of `--quiet`.

**Phase**: Phase 1 (CLI-01)

---

## Summary Table

| # | Domain | Severity | Pitfall | Phase |
|---|--------|----------|---------|-------|
| 1.1 | Shell | 🔴 | `eval` requirement not communicated; silent failure | P1 |
| 1.2 | Shell | 🔴 | `.bashrc` accumulates duplicate exports | P1 |
| 1.3 | Shell | 🔴 | Subshell switching doesn't affect parent shell | P1 |
| 1.4 | Shell | 🟡 | tmux/screen multiplexer not tracked; global scope | P1 |
| 1.5 | Shell | 🟡 | `.ccsrc` precedence undefined | P1 |
| 2.1 | Env Var | 🔴 | `/proc/PID/environ` exposes all tokens | P2 |
| 2.2 | Env Var | 🔴 | Scrollback captures printed tokens | P1 |
| 2.3 | Env Var | 🟡 | Terminal title bars expose token-derived values | P1 |
| 2.4 | Env Var | 🟢 | SSH sessions don't propagate state | P2 |
| 3.1 | Sessions | 🔴 | PID-based tracking breaks across forks/recycle | P1 |
| 3.2 | Sessions | 🟡 | No session created for pre-existing shells | P1 |
| 3.3 | Sessions | 🟡 | `deleteStaleSessions()` never called | P1 |
| 3.4 | Sessions | 🟡 | `started_at` dropped on `updateSession` | P1 |
| 3.5 | Sessions | 🟡 | Multiplexer pane lifecycle not tracked | P1 |
| 4.1 | Encryption | 🔴 | Key loss on any machine change is total | P2 |
| 4.2 | Encryption | 🟡 | Key derivation divergence between encrypt/decrypt | P2 |
| 4.3 | Encryption | 🟡 | Machine-bound key doesn't protect against same-machine attack | P2 |
| 4.4 | Encryption | 🟡 | PBKDF2 params not versioned; no migration path | P2 |
| 4.5 | Encryption | 🔴 | No key recovery path if machine-id lost | P2 |
| 4.6 | Encryption | 🟡 | Backup/restore not portable across machine changes | P1 |
| 5.1 | General | 🟡 | "Implied active" illusion; tool state vs. shell state disagree | P1 |
| 5.2 | Env Var | 🔴 | `ccs env` raw token exposure without guards | P1 |
| 5.3 | CLI | 🟡 | No exit code conventions defined | P1 |
| 5.4 | CLI | 🟡 | `--quiet` suppresses security warnings | P1 |

**Phase key**: P1 = CLI shell integration milestone; P2 = Encryption rework / keychain milestone.

---

## Unresolved Questions for Implementation

1. How should `ccs switch` work inside tmux by default — per-pane scope or global? (No good answer without a daemon; prefer global with warning.)
2. Should `ccs env --shell` detect whether it was `eval`'d and warn if not? (Yes — see 1.1.)
3. Is the machine-id file approach acceptable, or should the key be wrapped by OS keychain on first run? (Keychain is better but requires platform-specific implementation.)
4. Should `ccs run claude` exist as a single-child token injection, or is the env-var model the only supported path? (Both; `run` is better for security-sensitive contexts.)

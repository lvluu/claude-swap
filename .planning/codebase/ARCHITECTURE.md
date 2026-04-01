# Architecture — Claude Code Swap (ccs)

## Overview

`ccs` is a **high-performance Bun-based CLI/TUI tool** for managing Claude Code authentication profiles and terminal sessions. It provides a persistent, encrypted, per-machine store of API tokens with an interactive switcher that wires profiles into shell environment variables (`ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`).

---

## Architectural Pattern

**Layered Monolith** — single binary, four horizontal layers:

```
┌─────────────────────────────────────────────────────┐
│  CLI Entry  (src/cli/index.ts — Commander.js)       │
│  Commands: switch, add, remove, list, export,       │
│            import, quota, stats, current, env,       │
│            sessions, doctor, backup, restore         │
└──────────────────────┬──────────────────────────────┘
                       │ imports
┌──────────────────────▼──────────────────────────────┐
│  TUI Layer   (src/tui/screens/ + components/)       │
│  @clack/prompts — interactive multi-pane screens    │
└──────────────────────┬──────────────────────────────┘
                       │ imports
┌──────────────────────▼──────────────────────────────┐
│  Core Layer  (src/core/)                            │
│  profile.ts   — profile lifecycle & logic          │
│  auth.ts      — auth strategy / OAuth               │
│  storage.ts   — SQLite Database singleton           │
│  encryption.ts — AES-256-GCM encrypt/decrypt      │
└──────────────────────┬──────────────────────────────┘
                       │ imports
┌──────────────────────▼──────────────────────────────┐
│  Data Layer  (Bun:sqlite, Node crypto, FS)           │
│  SQLite WAL-mode DB at ~/.config/ccs/data.db       │
│  Machine-bound key derivation for token encryption  │
└─────────────────────────────────────────────────────┘
```

**There is no service/process daemon.** The CLI is stateless between invocations; all state lives in SQLite and the derived encryption key.

---

## Layers & Responsibilities

### 1. CLI Layer (`src/cli/`)

**File**: `src/cli/index.ts`
**Dependency**: `commander` (v12)

- Parses top-level flags (`--quiet`, `--json`, `--shell`, `--no-cache`)
- Registers all subcommands (switch, add, remove, list, export, import, quota, stats, current, env, sessions, doctor, backup, restore)
- Delegates execution to command handlers (currently stubs — `console.log("… - implementation pending")`)
- Entry point exposed as `bin: "ccs"` in `package.json`

No command handlers are wired to the core layer yet.

### 2. TUI Layer (`src/tui/`)

**Framework**: `@clack/prompts` + `@clack/core`
**Supports**: `chalk`, `ora` (spinners), `picocolors`

| File | Role |
|------|------|
| `screens/SwitchScreen.ts` | Interactive profile switcher with search |
| `screens/StatsScreen.ts` | Usage statistics and trends |
| `screens/QuotaScreen.ts` | Quota status and management |
| `components/ProfileList.ts` | Scrollable list of profiles |
| `components/SearchInput.ts` | Inline search filter |
| `components/PreviewPane.ts` | Profile detail / token preview |

Screens compose components. All are unimplemented stubs at present.

### 3. Core Layer (`src/core/`)

#### `profile.ts`
Profile entity management — CRUD operations delegating to `Database`. Handles `last_used` and `use_count` bookkeeping.

#### `auth.ts`
Authentication strategy abstraction (OAuth, manual token, env-variable). Placeholder at present.

#### `storage.ts`
**Singleton**: `Database` class wrapping `bun:sqlite`.

Key design decisions:
- **WAL mode** (`PRAGMA journal_mode = WAL`) — concurrent reads, no writer blocking
- **Foreign keys enforced** (`PRAGMA foreign_keys = ON`)
- **Migration system** — schema version tracked in `schema_version` table; runs `CREATE TABLE IF NOT EXISTS` idempotently
- **Row mapper pattern** — `rowToProfile`, `rowToSession`, `rowToQuota`, `rowToUsageLog` translate raw rows to typed objects
- **Singletons** — `Database.instance`, `Encryption._instance`

**Schema**:

| Table | Purpose |
|-------|---------|
| `profiles` | id, name, token_encrypted, base_url, auth_method, timestamps, tags |
| `sessions` | per-terminal sessions with shell/cwd/pid metadata |
| `quotas` | daily/monthly token counters per profile |
| `usage_log` | per-request token usage with model label |
| `settings` | key/value app configuration |

Indexes on: `sessions(profile_id)`, `sessions(terminal)`, `sessions(last_activity DESC)`, `usage_log(session_id)`, `usage_log(profile_id)`, `usage_log(timestamp DESC)`.

#### `encryption.ts`
**Algorithm**: AES-256-GCM, PBKDF2-KDF, SHA-512

- **Machine binding**: fingerprint = `hostname|platform|arch|cpu_count|[/etc/machine-id on Linux]|hashed_homedir`
- **KDF**: `pbkdf2Sync("ccs-encryption-key", sha256(fingerprint), 100_000 iterations, 32 bytes, sha512)`
- **Format**: `base64(iv ‖ auth_tag ‖ ciphertext)` — 16 + 16 + N bytes
- **Error type**: `EncryptionError` with descriptive messages (auth tag mismatch, invalid base64, truncated input)

Module-level singleton `getEncryption()`.

### 4. Utils Layer (`src/utils/`)

| File | Role |
|------|------|
| `logger.ts` | Structured console output |
| `formatter.ts` | Token/money formatting, date formatting |
| `validators.ts` | Input validation (token format, URL, etc.) |

---

## Data Flow

```
User shell
  │
  ▼
ccs switch work@example.com --shell
  │
  ▼
CLI index.ts ──► switch command handler
  │                (stub: console.log)
  │
  ▼
Database.getAllProfiles()
  │  (SQLite query, row mapper)
  ▼
Encryption.decryptSync(token_encrypted)
  │  (AES-256-GCM, machine-derived key)
  ▼
Outputs shell exports:
  export ANTHROPIC_AUTH_TOKEN="sk-ant-…"
  export ANTHROPIC_BASE_URL="https://api.anthropic.com/"
```

For future TUI flow:
```
ccs switch
  │
  ▼
SwitchScreen.ts
  ├─ SearchInput.ts   → filter profiles
  ├─ ProfileList.ts  → render candidates
  └─ PreviewPane.ts   → show token / metadata
  │
  ▼ (selection)
Database.updateProfile(last_used, use_count++)
  │
  ▼
Shell env written via --shell / --persistent / --local
```

---

## Key Abstractions

| Abstraction | Location | Interface |
|-------------|----------|-----------|
| Profile | `types/index.ts` | `Profile` interface |
| Session | `types/index.ts` | `Session` interface |
| Quota | `types/index.ts` | `Quota` interface |
| Usage log | `types/index.ts` | `UsageLog` interface |
| DB access | `core/storage.ts` | `Database` class |
| Encryption | `core/encryption.ts` | `Encryption` class |
| CLI program | `cli/index.ts` | `program` (Commander) |
| TTY screens | `tui/screens/*.ts` | screen classes (stub) |

---

## Entry Points

| Path | Type | Purpose |
|------|------|---------|
| `src/cli/index.ts` | CLI bin | `ccs` command entry |
| `src/core/storage.ts` | Library | `initializeDatabase()`, `getDatabase()` |
| `src/core/encryption.ts` | Library | `encryptForStorage()`, `decryptFromStorage()` |

---

## Security Model

1. Tokens stored **encrypted at rest** — AES-256-GCM with machine-bound key
2. Key derived via **PBKDF2** (100K iterations, SHA-512) — no user password required for normal use
3. Auth tag on every ciphertext — **tamper detection** baked in
4. Machine fingerprint means tokens **cannot be copied to another machine** and decrypted
5. Optional OS keychain integration (planned)
6. Optional password-encrypted export (planned)

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| CLI startup | <10ms | Bun native TS, no bundling at runtime |
| Profile switch | <20ms | SQLite WAL, in-memory key derivation |
| List 100 profiles | <5ms | Indexed queries |

---

## Status

Early-stage scaffolding. CLI command handlers are stub implementations pending the phased roadmap (Phase 1–6, ~10 weeks to v1.0.0). Core data layer (DB, encryption) is functional and tested.

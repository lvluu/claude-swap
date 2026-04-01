# Codebase Concerns — `claude-swap`

> Audited: 2026-04-01. Purpose: catalog tech debt, bugs, security issues, performance risks, and fragile areas for prioritization.

---

## 1. 🔴 Critical: Entire Application is Placeholder / Stub Code

### All commands are no-ops
Every command handler in `src/cli/index.ts` prints `"implementation pending"` and returns `undefined`. The full CLI — **switch, add, remove, list, export, import, quota, stats, current, env, sessions, doctor, backup, restore** — is unimplemented.

**Impact**: The codebase has zero runtime behaviour. Storage, encryption, TUI, and quota modules are unreachable dead code.

---

## 2. 🔴 Critical: Encryption Uses a Hardcoded, Deriveable Secret

**File**: `src/core/encryption.ts` — `deriveKey()`

```ts
// ⚠️ Hardcoded passphrase — anyone who knows this string can brute-force tokens
pbkdf2Sync("ccs-encryption-key", salt, ITERATIONS, KEY_LEN, DIGEST);
```

- The passphrase `"ccs-encryption-key"` is constant in the source code. It is **not** derived from user input.
- An attacker with code-execution on the same machine can decrypt every stored token by copying the same derivation logic.
- The README falsely advertises "AES-256-GCM" and "PBKDF2 key derivation" as security guarantees — they are present but **inadequate** without a user-supplied component (e.g. OS keychain unlock, master password).
- `src/cli/index.ts` mentions an optional OS keychain integration feature flag but it is not implemented.

**Fix required**: Derive the key from a user-unlocked secret (keychain, master password via `pinentry`, or `Bun.passwordSync`), not from a static string.

---

## 3. 🔴 Critical: Encryption Fingerprint Tied to Transient Machine Data

**File**: `src/core/encryption.ts` — `machineFingerprint`

```ts
const parts: string[] = [hostname(), platform(), arch(), String(cpus().length)];
// ...
this._machineFingerprint = parts.join("|");
```

- After a CPU upgrade, OS reinstall, or VM clone, the fingerprint changes and **all stored tokens become irrecoverable**.
- `cpus().length` is not stable across machines of the same model; `arch()` is not stable across ARM→x86 transitions.
- The fingerprint is **human-meaningless**, so users cannot re-derive it to recover data.

**Fix required**: Use a persistent, dedicated machine-identity file (e.g. `$XDG_CONFIG_DIR/ccs/machine-id`) generated once at install time.

---

## 4. 🔴 High: Stale Session Detection Is Never Invoked

**File**: `src/core/storage.ts`

`deleteStaleSessions(maxAgeMs: number)` is defined on `Database` but never called. Stale sessions accumulate indefinitely in SQLite.

---

## 5. High: Quota Auto-Reset Is Defined But Never Triggered

**File**: `src/core/storage.ts`

`resetQuotaCounters(profileId)` is defined but not wired to any scheduler. Quota counters will monotonically increase forever past daily/monthly limits.

---

## 6. High: `updateSession` Always Overwrites `started_at`

**File**: `src/core/storage.ts` — `updateSession`

```ts
`UPDATE sessions SET profile_id = ?, terminal = ?, last_activity = ?, metadata = ? WHERE id = ?`
```

`started_at` is omitted from the `UPDATE` SET clause, so it is always `NULL` after the initial `createSession` row is updated (SQLite `NULL` default on column re-assignment if omitted, or unchanged — either way the intent is broken).

---

## 7. High: `ExportData` Type Contains Plaintext `token` Field

**File**: `src/types/index.ts` — `ExportedProfile`

```ts
export interface ExportedProfile {
  token: string;  // ← plaintext
```

The export types model tokens as plaintext strings, which will encourage insecure handling in `export.ts`/`import.ts` (both stubs). The `export` command has `--encrypt` but the types give no hint of encrypted vs plaintext variants.

---

## 8. High: `noUncheckedIndexedAccess` Enabled But Arrays Not Guarded

**File**: `tests/unit/storage.test.ts`

```ts
expect(logs[0]?.tokens_used).toBe(1000);  // guarded with ?
expect(profiles[0]?.name).toBe("Profile 1"); // guarded with ?
```

Tests compensate with optional-chaining `?.`. If the queries returned empty results, this would silently pass rather than fail. With `noUncheckedIndexedAccess`, the correct pattern is to assert length first, then access.

---

## 9. Medium: `daily_limit` / `monthly_limit` Are `INTEGER` But Typed as `number | null`

**File**: `src/core/storage.ts` — CREATE_TABLES

```sql
daily_limit INTEGER,   -- SQLite stores integers for small values
monthly_limit INTEGER,
```

While Bun's SQLite driver coerces these correctly, the column types and TypeScript types are misaligned (TypeScript says `number | null`, SQLite stores `INTEGER NULL`). Consider using `REAL` for consistency or explicit casting in `rowToQuota`.

---

## 10. Medium: Database File Lives in `$HOME/.config/ccs/` — Not `XDG_CONFIG_HOME`

**File**: `src/core/storage.ts` — `getDbPath()`

```ts
const home = Bun.env.HOME ?? "/tmp";
return `${home}/.config/ccs/data.db`;
```

The code hard-codes `.config` instead of respecting `$XDG_CONFIG_HOME` (POSIX convention). On systems where `$XDG_CONFIG_HOME` is set differently, two database files may coexist. On systems without `$HOME`, it falls back to `/tmp` which is **world-readable and ephemeral** — a serious security concern for a token store.

---

## 11. Medium: Token Metadata JSON Parsed Without Try/Catch

**File**: `src/core/storage.ts` — `rowToProfile`, `rowToSession`

```ts
metadata: JSON.parse(r.metadata as string),
tags: JSON.parse(r.tags as string),
```

If the SQLite data is corrupted (e.g. invalid UTF-8, truncated JSON), `JSON.parse` will throw an unhandled exception propagating as a 500-level crash. Should be wrapped with fallback `{}` / `[]`.

---

## 12. Medium: All TUI Modules Are Empty Stubs

**Files**: `src/tui/screens/*.ts`, `src/tui/components/*.ts`

All 6 TUI files are `export {};` with zero exports. `SwitchScreen`, `QuotaScreen`, `StatsScreen`, `ProfileList`, `SearchInput`, `PreviewPane` are dead weight that will require full implementation.

---

## 13. Medium: Storage Module Has No WAL Cleanup

**File**: `src/core/storage.ts`

`PRAGMA journal_mode = WAL` is set, but there is no periodic `PRAGMA wal_checkpoint(TRUNCATE)` call. WAL files can grow unbounded on disk over time.

---

## 14. Medium: `session.metadata` Type Is Strict but Constructor Accepts Anything

**File**: `src/types/index.ts` — `Session.metadata`

```ts
metadata: { shell: string; cwd: string; parent_pid: number; }  // strict shape
```

But `src/core/storage.ts` `createSession` accepts `Session` with `JSON.stringify(session.metadata)`. If callers pass a non-conforming shape, it silently stores the wrong data. The type does not reflect that `metadata` is serialized JSON in the DB.

---

## 15. Low: `ProgramStatus` Reads Show `"implementation pending"`

Both `src/core/profile.ts` and `src/core/auth.ts` are empty stubs. Any code that calls them (none yet, since CLI is all stubs) would receive `undefined`.

---

## 16. Low: Tests Are Skeleton Placeholders

**Files**: `tests/unit/cli.test.ts`, `tests/integration/cli.test.ts`

```ts
test("placeholder - CLI structure exists", () => { expect(true).toBe(true); });
```

These provide zero coverage of actual behaviour.

---

## 17. Low: `bunfig.toml` Exists But Is Unread

**File**: `bunfig.toml`

Present but not examined. Could contain dev overrides that affect `bun run` behaviour.

---

## 18. Low: `scripts/check-loc.ts` Hardcodes `MAX_LOC = 500`

If enforced, the 380-line `storage.ts` (DB + all operations) already exceeds the 500-line limit and would fail CI. This limits future extensibility without reconfiguration.

---

## Summary Table

| # | Severity | Area | Description |
|---|----------|------|-------------|
| 1 | 🔴 Critical | CLI | All commands are unimplemented stubs |
| 2 | 🔴 Critical | Security | Encryption uses hardcoded static passphrase |
| 3 | 🔴 Critical | Security | Encryption key unrecoverable after machine changes |
| 4 | High | Bug | Stale session cleanup never called |
| 5 | High | Bug | Quota auto-reset never triggered |
| 6 | High | Bug | `updateSession` drops `started_at` |
| 7 | High | Type Design | `ExportedProfile.token` is plaintext in types |
| 8 | High | Type Safety | Tests suppress `noUncheckedIndexedAccess` with `?.` |
| 9 | Medium | Type/DB | `INTEGER` vs `number` mismatch in quota columns |
| 10 | Medium | Security | Falls back to `/tmp` for DB path if `$HOME` absent |
| 11 | Medium | Robustness | JSON parse without error handling in row converters |
| 12 | Medium | TUI | All TUI modules are empty stubs |
| 13 | Medium | Performance | WAL file grows unbounded |
| 14 | Medium | Type Design | `metadata` typed strictly but serialized as JSON |
| 15 | Low | Dead Code | `profile.ts`, `auth.ts` empty stubs |
| 16 | Low | Testing | CLI + integration tests are skeleton placeholders |
| 17 | Low | Config | `bunfig.toml` not examined |
| 18 | Low | Tech Debt | LOC limit too strict for current storage.ts size |

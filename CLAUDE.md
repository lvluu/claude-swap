<!-- GSD:project-start source:PROJECT.md -->
## Project

**Claude Code Swap (ccs)**

A Bun-based CLI for managing multiple Claude Code accounts (API keys/tokens) and switching between them instantly across terminal sessions. You run `ccs switch profile1` and `claude` immediately uses that profile — no logout, no login, no env var hunting.

**Core Value:** **Switch between Claude API accounts in < 1 second across any terminal, with per-terminal isolation and tokens stored securely.**

### Constraints

- **Runtime**: Bun (TypeScript native, built-in SQLite)
- **TypeScript**: Strict mode, `noUncheckedIndexedAccess: true`, no `any`
- **CLI**: Commander.js v12, stateless between invocations (no daemon)
- **Encryption**: Machine-bound AES-256-GCM — key derived locally, not recoverable on different machine
- **Terminal isolation**: Via SQLite sessions table with shell/cwd/pid tracking
- **Shell integration**: `--shell` / `--local` / `--persistent` flags write env vars to `.env` or shell config
- **Performance**: `ccs switch X` must complete in < 1 second
- **Testing**: `bun test` with bun:test framework
- **Quality gates**: All PRs must pass `bun run ci`
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages & Runtime
| | |
|---|---|
| **Runtime** | [Bun](https://bun.sh) v1.x — all scripts, CLI entry point, build, and tests run on Bun |
| **Language** | TypeScript 5.7+ with `ESNext` module/target, strict mode enabled |
| **Module System** | ESM (`"type": "module"` in `package.json`) |
## TypeScript Configuration
- `tsconfig.json` — strict mode, `bun-types` for runtime types, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- Configured for bundler-style `moduleResolution`
- Source maps and declaration maps enabled for `dist/` output
## Dependencies
### Production
| Package | Version | Purpose |
|---|---|---|
| `commander` | ^12.1.0 | CLI argument parsing and command tree |
| `@clack/core` | ^0.3.4 | TUI spinner / progress / prompt primitives |
| `@clack/prompts` | ^0.8.2 | Higher-level TUI prompt components |
| `ora` | ^8.1.1 | Terminal spinner / loading indicator |
| `picocolors` | ^1.1.1 | ANSI color utilities |
| `chalk` | ^5.3.0 | Terminal string styling |
### Development
| Package | Version | Purpose |
|---|---|---|
| `bun` (types) | ^1.1.14 | `bun-types` for TypeScript type definitions |
| `typescript` | ^5.7.2 | Type checker (`tsc --noEmit`) |
| `oxlint` | ^1.58.0 | Linter with TypeScript, unicorn, oxc plugins |
| `oxfmt` | ^0.43.0 | Code formatter |
### No Production Database Client
## Build & Tooling
| | |
|---|---|
| **Bundler** | `bun build` → `dist/` (Node.js target) |
| **Test Runner** | `bun test` with `--watch` mode |
| **Lockfile** | `bun.lock` (Bun's native lockfile) |
| **Package Manager** | Bun (configured npm registry: `registry.npmjs.org`) |
### npm Scripts
### Linting
- `.oxlintrc.json` — correctness rules set to `error`, TypeScript/unicorn/oxc plugins active
- `.gitignore` excludes `dist/`, `node_modules/`, lockfile pattern
- `scripts/check-loc.ts` — custom line-of-code check in the lint pipeline
### CI / GitHub Actions
## Configuration Files
| File | Purpose |
|---|---|
| `package.json` | Package metadata, scripts, dependencies |
| `tsconfig.json` | TypeScript compiler options |
| `bunfig.toml` | Bun install configuration (npm registry) |
| `.oxlintrc.json` | Linter rules and plugin config |
| `.gitignore` | Excludes `dist/`, `node_modules/`, `bun.lock` |
| `AGENTS.md` | Agent instructions |
## Project Structure
## Planned Storage Paths
| Path | Purpose |
|---|---|
| `~/.config/ccs/data.db` | SQLite database (WAL mode) |
| `~/.config/ccs/` | Config root |
| `.ccsrc` (per workspace) | Workspace-specific profile override |
## Key Architectural Decisions
- **Singleton Database** — `Database` class with static `initialize()` / `getInstance()` / `close()`
- **Schema versioning** — `schema_version` table; migrations run on init if version < `SCHEMA_VERSION`
- **Encryption per-machine** — key derived from machine fingerprint (hostname, platform, arch, CPU count, `/etc/machine-id`) via PBKDF2-SHA512 at 100K iterations
- **AES-256-GCM** — token encryption with random IV + auth tag per record
- **No external DB client** — `bun:sqlite` is native; WAL mode, foreign keys enabled
- **ESM throughout** — no CommonJS interop for application code
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Language & Build
| Concern | Value |
|---|---|
| Runtime | Bun |
| Language | TypeScript, strict mode |
| Module system | ESNext (`"type": "module"`) |
| Module resolution | `bundler` |
| Type checking | `tsc --noEmit` with `noUncheckedIndexedAccess: true` |
| Max file size | **500 LOC** enforced by `scripts/check-loc.ts` |
## TypeScript Standards
### Strict Flags
### Type Discipline
- **Never use `any`** — use `unknown` and narrow with guards
- Prefer `interface` for object shapes; `type` for unions and utility types
- Explicit return types on all exported functions
- Use `as` casts sparingly; prefer explicit type guards
- Nullable fields use `| null` (not `undefined`); optional fields use `?`
- Cast DB rows with `as Record<string, unknown>` then narrow
### Nullary DB Pattern
## Naming Conventions
| Kind | Convention | Example |
|---|---|---|
| Variables & functions | `camelCase` | `getEncryption`, `encryptSync` |
| Classes & interfaces/types | `PascalCase` | `Encryption`, `Profile` |
| Constants (module-level) | `SCREAMING_SNAKE_CASE` | `ALGORITHM`, `KEY_LEN` |
| Private fields | `_camelCase` (underscore prefix) | `_machineFingerprint` |
| Unused parameters | `_prefixed` | `_profile`, `_opts` |
| File names | `kebab-case.ts` | `encryption.ts`, `storage.ts` |
| Enum-like string unions | `lowercase` or `kebab-case` | `"oauth" \| "manual" \| "env"` |
## File Layout & Structure
### Ordering within files
## Error Handling
### Error Classes
### Error Throwing Patterns
- Throws on invalid input: `EncryptionError("Invalid base64 input")`
- Throws on corruption: `EncryptionError("Ciphertext too short")`
- Throws on auth failure: `EncryptionError("Decryption failed: auth tag mismatch or corrupted data")`
- No `console.error` in library code — let errors propagate
- SQLite errors propagate as-is (Bun runtime throws)
### Empty/Placeholder Modules
## Storage & Encryption
- Tokens stored **encrypted at rest** using `aes-256-gcm`
- Key derived from machine fingerprint via `pbkdf2Sync` (100k iterations, sha512)
- Fingerprint uses `/etc/machine-id` on Linux, `homedir` elsewhere
- Blob format: `base64(iv ‖ auth_tag ‖ ciphertext)` — no separator, fixed-width parts
- Singleton pattern via `getInstance()` / `getEncryption()` factory
- Sync methods (`encryptSync`, `decryptSync`) exist alongside async wrappers
## CLI (Commander.js)
- Entry: `src/cli/index.ts`
- Program created with `new Command()`; `program.parse()` called at module level
- Unused args/opts prefixed with `_`: `(_profile, _opts)`
- Global flags: `--quiet / -q`, `--json / -j`, `--no-cache`, `--shell`
- Each subcommand is a fluent chain: `.command(name).description(text).option(...).action(fn)`
- Stubs print `"{command} command - implementation pending"` until implemented
## Module Aliases
- No path aliases configured — all imports use relative paths
- Extensions are explicit: `from "../types/index.js"` (`.js` required in ESM)
- Internal imports always include the `.js` extension
## Linting & Formatting
| Tool | Purpose | Config |
|---|---|---|
| `oxlint` | Static analysis, JS correctness | `.oxlintrc.json` (typescript + unicorn + oxc plugins) |
| `oxfmt` | Formatting | `.oxfmtrc.json` (defaults) |
| `check-loc.ts` | LOC enforcement (<500 LOC/file) | `scripts/check-loc.ts` |
- `bun run lint` = `check-loc` + `oxlint`
- `bun run lint:fix` = `check-loc` + `oxlint --fix`
- `bun run format` = `oxfmt --write src/`
- `bun run format:check` = `oxfmt --check src/`
## Commit Conventions
## Anti-Patterns to Avoid
- `any` type
- `console.log` / `console.error` in library code
- Non-async top-level await without justification
- Magic numbers (extract to named constants)
- Inline SQL (SQL is defined as module-level `const` strings)
- Missing `.js` extension on ESM imports
- File > 500 LOC
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Overview
## Architectural Pattern
```
```
## Layers & Responsibilities
### 1. CLI Layer (`src/cli/`)
- Parses top-level flags (`--quiet`, `--json`, `--shell`, `--no-cache`)
- Registers all subcommands (switch, add, remove, list, export, import, quota, stats, current, env, sessions, doctor, backup, restore)
- Delegates execution to command handlers (currently stubs — `console.log("… - implementation pending")`)
- Entry point exposed as `bin: "ccs"` in `package.json`
### 2. TUI Layer (`src/tui/`)
| File | Role |
|------|------|
| `screens/SwitchScreen.ts` | Interactive profile switcher with search |
| `screens/StatsScreen.ts` | Usage statistics and trends |
| `screens/QuotaScreen.ts` | Quota status and management |
| `components/ProfileList.ts` | Scrollable list of profiles |
| `components/SearchInput.ts` | Inline search filter |
| `components/PreviewPane.ts` | Profile detail / token preview |
### 3. Core Layer (`src/core/`)
#### `profile.ts`
#### `auth.ts`
#### `storage.ts`
- **WAL mode** (`PRAGMA journal_mode = WAL`) — concurrent reads, no writer blocking
- **Foreign keys enforced** (`PRAGMA foreign_keys = ON`)
- **Migration system** — schema version tracked in `schema_version` table; runs `CREATE TABLE IF NOT EXISTS` idempotently
- **Row mapper pattern** — `rowToProfile`, `rowToSession`, `rowToQuota`, `rowToUsageLog` translate raw rows to typed objects
- **Singletons** — `Database.instance`, `Encryption._instance`
| Table | Purpose |
|-------|---------|
| `profiles` | id, name, token_encrypted, base_url, auth_method, timestamps, tags |
| `sessions` | per-terminal sessions with shell/cwd/pid metadata |
| `quotas` | daily/monthly token counters per profile |
| `usage_log` | per-request token usage with model label |
| `settings` | key/value app configuration |
#### `encryption.ts`
- **Machine binding**: fingerprint = `hostname|platform|arch|cpu_count|[/etc/machine-id on Linux]|hashed_homedir`
- **KDF**: `pbkdf2Sync("ccs-encryption-key", sha256(fingerprint), 100_000 iterations, 32 bytes, sha512)`
- **Format**: `base64(iv ‖ auth_tag ‖ ciphertext)` — 16 + 16 + N bytes
- **Error type**: `EncryptionError` with descriptive messages (auth tag mismatch, invalid base64, truncated input)
### 4. Utils Layer (`src/utils/`)
| File | Role |
|------|------|
| `logger.ts` | Structured console output |
| `formatter.ts` | Token/money formatting, date formatting |
| `validators.ts` | Input validation (token format, URL, etc.) |
## Data Flow
```
```
```
```
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
## Entry Points
| Path | Type | Purpose |
|------|------|---------|
| `src/cli/index.ts` | CLI bin | `ccs` command entry |
| `src/core/storage.ts` | Library | `initializeDatabase()`, `getDatabase()` |
| `src/core/encryption.ts` | Library | `encryptForStorage()`, `decryptFromStorage()` |
## Security Model
## Performance Targets
| Operation | Target | Notes |
|-----------|--------|-------|
| CLI startup | <10ms | Bun native TS, no bundling at runtime |
| Profile switch | <20ms | SQLite WAL, in-memory key derivation |
| List 100 profiles | <5ms | Indexed queries |
## Status
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

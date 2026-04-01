# Technology Stack

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

The project uses **Bun's native SQLite binding** (`bun:sqlite`) — no external database driver dependency.

## Build & Tooling

| | |
|---|---|
| **Bundler** | `bun build` → `dist/` (Node.js target) |
| **Test Runner** | `bun test` with `--watch` mode |
| **Lockfile** | `bun.lock` (Bun's native lockfile) |
| **Package Manager** | Bun (configured npm registry: `registry.npmjs.org`) |

### npm Scripts

```bash
bun run start        # bun run src/cli/index.ts
bun run build        # bun build → dist/
bun run test         # bun test
bun run test:watch   # bun test --watch
bun run lint         # bun run scripts/check-loc.ts && oxlint
bun run lint:fix     # lint + auto-fix
bun run format       # oxfmt --write src/
bun run format:check # oxfmt --check src/
bun run typecheck    # tsc --noEmit
bun run ci           # typecheck && lint && format:check && test
```

### Linting

- `.oxlintrc.json` — correctness rules set to `error`, TypeScript/unicorn/oxc plugins active
- `.gitignore` excludes `dist/`, `node_modules/`, lockfile pattern
- `scripts/check-loc.ts` — custom line-of-code check in the lint pipeline

### CI / GitHub Actions

`.github/workflows/build.yml` — runs on `ubuntu-latest`:
1. `bun install --frozen-lockfile`
2. `bun run ci` (typecheck → lint → format:check → test)

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

```
src/
├── cli/
│   ├── index.ts              # Commander.js root, all subcommands registered
│   └── commands/
│       ├── add.ts            # add profile (OAuth / manual / env)
│       ├── switch.ts         # switch profile
│       ├── export.ts         # export profiles
│       ├── import.ts         # import profiles
│       ├── quota.ts          # quota management
│       └── stats.ts          # usage statistics
├── core/
│   ├── auth.ts               # authentication helpers (planned)
│   ├── encryption.ts         # AES-256-GCM + PBKDF2 token encryption
│   ├── profile.ts            # profile management helpers
│   └── storage.ts            # SQLite Database class (bun:sqlite)
├── tui/
│   ├── components/
│   │   ├── PreviewPane.ts
│   │   ├── ProfileList.ts
│   │   └── SearchInput.ts
│   └── screens/
│       ├── QuotaScreen.ts
│       ├── StatsScreen.ts
│       └── SwitchScreen.ts
├── utils/
│   ├── formatter.ts
│   ├── logger.ts
│   └── validators.ts
├── types/index.ts            # All TypeScript interfaces
└── version.ts                # Version constant
```

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

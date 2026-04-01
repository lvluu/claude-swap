# Structure — Claude Code Swap (ccs)

## Directory Layout

```
claude-swap/                    # Git worktree root
├── .git/                       # Git repository
├── .github/
│   └── workflows/              # CI/CD (GitHub Actions)
├── .omc/                       # OMC orchestration state
│   ├── plans/                  # Project plans
│   ├── state/                  # Mode state files
│   └── sessions/               # Session-scoped state
├── .planning/                  # Planning outputs (this repo)
│   └── codebase/
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md
├── node_modules/               # Bun-managed dependencies
├── scripts/
│   └── check-loc.ts            # Line-of-code check script
├── src/
│   ├── cli/
│   │   ├── index.ts            # CLI entry point (Commander.js)
│   │   └── commands/           # Command handler stubs
│   │       ├── add.ts
│   │       ├── export.ts
│   │       ├── import.ts
│   │       ├── quota.ts
│   │       ├── stats.ts
│   │       └── switch.ts
│   ├── core/
│   │   ├── auth.ts             # Auth strategy abstraction
│   │   ├── encryption.ts      # AES-256-GCM encryption
│   │   ├── profile.ts          # Profile entity logic
│   │   └── storage.ts          # SQLite Database singleton
│   ├── tui/
│   │   ├── components/
│   │   │   ├── PreviewPane.ts
│   │   │   ├── ProfileList.ts
│   │   │   └── SearchInput.ts
│   │   └── screens/
│   │       ├── QuotaScreen.ts
│   │       ├── StatsScreen.ts
│   │       └── SwitchScreen.ts
│   ├── types/
│   │   └── index.ts            # All TypeScript interfaces
│   ├── utils/
│   │   ├── formatter.ts
│   │   ├── logger.ts
│   │   └── validators.ts
│   └── version.ts              # Version constant
├── tests/
│   ├── integration/
│   │   └── cli.test.ts
│   └── unit/
│       ├── cli.test.ts
│       ├── encryption.test.ts
│       └── storage.test.ts
├── .gitignore
├── .oxlintrc.json              # oxlint config
├── .prettierrc                 # (referenced in AGENTS.md, not present)
├── AGENTS.md                   # Agent guidelines & coding standards
├── bun.lock                    # Bun lockfile
├── bunfig.toml                 # Bun config
├── package.json
├── PROJECT-ROADMAP.md           # 15-issue, 10-week roadmap
├── README.md
└── tsconfig.json
```

---

## Naming Conventions

| Kind | Convention | Example |
|------|-----------|---------|
| Files (TypeScript) | `kebab-case.ts` | `check-loc.ts`, `storage.ts` |
| Classes | `PascalCase` | `Database`, `Encryption`, `EncryptionError` |
| Interfaces | `PascalCase` | `Profile`, `Session`, `Quota` |
| Type aliases | `PascalCase` | `SwitchMode`, `RotationStrategy` |
| Functions/variables | `camelCase` | `getDbPath`, `encryptSync`, `_machineFingerprint` |
| Constants | `SCREAMING_SNAKE_CASE` | `SCHEMA_VERSION`, `KEY_LEN`, `ALGORITHM` |
| Unused parameters | `_` prefix | `_profile`, `_opts`, `_file` |
| CLI bin | `ccs` | `ccs switch`, `ccs add` |
| Environment keys | `ANTHROPIC_*` | `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` |

---

## Key File Locations

### Source

| File | What it contains |
|------|-----------------|
| `src/cli/index.ts` | Commander program, all subcommand definitions, global flags |
| `src/core/storage.ts` | `Database` singleton, all SQL, all row mappers |
| `src/core/encryption.ts` | `Encryption` class, `EncryptionError`, key derivation, module singletons |
| `src/core/profile.ts` | Profile business logic |
| `src/core/auth.ts` | Auth strategy placeholders |
| `src/types/index.ts` | Every TypeScript interface and type alias |
| `src/version.ts` | Single `VERSION` export |

### Tests

| File | Coverage |
|------|---------|
| `tests/unit/encryption.test.ts` | Encryption round-trip, error cases |
| `tests/unit/storage.test.ts` | Database operations |
| `tests/unit/cli.test.ts` | CLI argument parsing |
| `tests/integration/cli.test.ts` | End-to-end CLI flow |

### Config

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript strict mode, Bun types |
| `bunfig.toml` | Bun configuration |
| `.oxlintrc.json` | oxlint rule configuration |
| `.github/workflows/` | GitHub Actions CI |

---

## Data Storage

| Path | Format | Purpose |
|------|--------|---------|
| `~/.config/ccs/data.db` | SQLite (WAL) | Profiles, sessions, quotas, usage logs, settings |

> **Note**: hardcoded in `storage.ts` via `getDbPath()` — reads `HOME` env var.
> Data directory creation is handled by Bun at write time (SQLite creates the DB file on first open).

---

## Module Dependency Graph

```
src/cli/index.ts
  └─> src/version.ts
  └─> src/cli/commands/*.ts     (stubs, not yet wired)

src/core/storage.ts
  └─> src/types/index.ts
  └─> bun:sqlite (builtin)

src/core/encryption.ts
  └─> node:crypto (builtin)
  └─> node:fs     (builtin)
  └─> node:os     (builtin)

src/core/profile.ts
  └─> src/core/storage.ts
  └─> src/types/index.ts

src/types/index.ts              ← pure types, no imports

src/utils/logger.ts             ← shared helpers
src/utils/formatter.ts
src/utils/validators.ts

src/tui/screens/*.ts
  └─> src/tui/components/*.ts
  └─> @clack/prompts
  └─> @clack/core
  └─> chalk, ora, picocolors
  └─> src/types/index.ts
```

---

## CI / Quality Gates

All enforced by `bun run ci` (runs sequentially):

```
typecheck  → tsc --noEmit
lint       → scripts/check-loc.ts && oxlint
format     → oxfmt --check src/
test       → bun test
```

No gate may be skipped (per `AGENTS.md` Permissions policy).

---

## Package Metadata

| Field | Value |
|-------|-------|
| Name | `claude-swap` |
| Bin | `ccs` → `src/cli/index.ts` |
| Module | `src/cli/index.ts` |
| Runtime | Bun |
| Type | ESM (`"type": "module"`) |
| License | MIT |

---

## Commit Convention

```
feat:     new feature
fix:      bug fix
docs:     documentation only
ci:       CI/CD changes
refactor: code restructuring, no behavior change
test:     adding/updating tests
```

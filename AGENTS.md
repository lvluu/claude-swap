# Claude Code Swap - Agent Guidelines

## Project Overview

`ccs` is a high-performance Bun-based CLI/TUI tool for managing Claude Code sessions and profiles. Built with TypeScript strict mode, Bun runtime, and oxlint/oxfmt for code quality.

## Tech Stack

- **Runtime**: Bun (native TypeScript, built-in SQLite)
- **Language**: TypeScript (strict mode, `noUncheckedIndexedAccess`)
- **Linting**: oxlint (oxc JavaScript Oxidation Compiler)
- **Formatting**: oxfmt
- **CLI**: Commander.js
- **TUI**: @clack/prompts

## Quality Gates

All changes MUST pass before merge:

```bash
bun run ci
# Equivalent to: typecheck && lint && format:check && test
```

| Gate         | Command                | Purpose                  |
| ------------ | ---------------------- | ------------------------ |
| Type Check   | `bun run typecheck`    | TypeScript strict mode   |
| Lint         | `bun run lint`         | oxlint static analysis   |
| Format Check | `bun run format:check` | Code formatting          |
| Tests        | `bun test`             | Unit & integration tests |

## Code Standards

### TypeScript

- Strict mode enabled (all strict flags)
- `noUncheckedIndexedAccess: true`
- No `any` types — use `unknown` and narrow
- Explicit return types on exported functions
- Interface for object shapes, type for unions/utility

### Naming Conventions

- camelCase for variables/functions
- PascalCase for types/interfaces/classes
- SCREAMING_SNAKE_CASE for constants
- Prefix unused params with `_` (e.g., `_profile`)

### File Structure

```
src/
├── cli/           # Commander commands
│   ├── index.ts   # Entry point
│   └── commands/  # Command handlers
├── core/          # Business logic (profile, auth, storage, encryption)
├── tui/           # Interactive components
│   ├── components/
│   └── screens/
├── utils/         # Helpers (logger, formatter, validators)
└── types/         # TypeScript interfaces
```

### Commit Conventions

```
feat: new feature
fix: bug fix
docs: documentation only
ci: CI/CD changes
refactor: code restructuring without behavior change
test: adding/updating tests
```

## Development Workflow

1. **Before writing code**: Read `AGENTS.md` and understand quality gates
2. **During development**: Run `bun run lint:fix` and `bun run format` frequently
3. **Before commit**: Run `bun run ci` — must pass all gates
4. **After commit**: Verify CI passes on GitHub Actions

## Issue Workflow

1. Create branch from `main`: `feat/issue-{number}-{slug}`
2. Implement with passing tests
3. Ensure all quality gates green
4. Create PR with link to issue
5. Squash merge after review

## Testing Requirements

- New features require tests
- Bug fixes require regression tests
- Run `bun test` before each commit

## Permissions

- Never commit secrets, tokens, or credentials
- Never disable linting/formatting rules
- Never skip CI checks
- Never force push to `main`

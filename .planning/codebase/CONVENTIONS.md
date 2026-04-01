# Code Conventions — `claude-swap`

> Auto-generated from codebase analysis. Keep in sync with `AGENTS.md` and tool configs.

---

## Language & Build

| Concern | Value |
|---|---|
| Runtime | Bun |
| Language | TypeScript, strict mode |
| Module system | ESNext (`"type": "module"`) |
| Module resolution | `bundler` |
| Type checking | `tsc --noEmit` with `noUncheckedIndexedAccess: true` |
| Max file size | **500 LOC** enforced by `scripts/check-loc.ts` |

---

## TypeScript Standards

### Strict Flags

All strict flags are enabled. Notable non-defaults:

```json
{
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true
}
```

### Type Discipline

- **Never use `any`** — use `unknown` and narrow with guards
- Prefer `interface` for object shapes; `type` for unions and utility types
- Explicit return types on all exported functions
- Use `as` casts sparingly; prefer explicit type guards
- Nullable fields use `| null` (not `undefined`); optional fields use `?`
- Cast DB rows with `as Record<string, unknown>` then narrow

### Nullary DB Pattern

```ts
// Row mapper from untyped SQLite row → typed domain object
private rowToProfile(row: unknown): Profile {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    // ...
    base_url: (r.base_url as string) ?? undefined,
  };
}
```

---

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

---

## File Layout & Structure

```
src/
├── cli/           # Commander program & command stubs
│   ├── index.ts   # Entry point — program.parse() runs here
│   └── commands/  # Command handlers (future)
├── core/          # Business logic (auth, encryption, profile, storage)
├── tui/            # @clack/prompts interactive components
│   ├── components/
│   └── screens/
├── utils/          # Pure helpers (logger, formatter, validators)
└── types/          # Shared TypeScript interfaces and unions
```

### Ordering within files

1. Imports (`node:fs`, then `bun:sqlite`, then internal, then types)
2. Module-level constants (`SCREAMING_SNAKE_CASE`)
3. Error classes (extend `Error`)
4. Main class / function exports
5. Singleton / factory helpers
6. Module entry `export {}` (empty for side-effect modules)

---

## Error Handling

### Error Classes

Define a custom error class per domain:

```ts
export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}
```

### Error Throwing Patterns

- Throws on invalid input: `EncryptionError("Invalid base64 input")`
- Throws on corruption: `EncryptionError("Ciphertext too short")`
- Throws on auth failure: `EncryptionError("Decryption failed: auth tag mismatch or corrupted data")`
- No `console.error` in library code — let errors propagate
- SQLite errors propagate as-is (Bun runtime throws)

### Empty/Placeholder Modules

Stub files use empty export to satisfy module semantics:

```ts
export {};
```

---

## Storage & Encryption

- Tokens stored **encrypted at rest** using `aes-256-gcm`
- Key derived from machine fingerprint via `pbkdf2Sync` (100k iterations, sha512)
- Fingerprint uses `/etc/machine-id` on Linux, `homedir` elsewhere
- Blob format: `base64(iv ‖ auth_tag ‖ ciphertext)` — no separator, fixed-width parts
- Singleton pattern via `getInstance()` / `getEncryption()` factory
- Sync methods (`encryptSync`, `decryptSync`) exist alongside async wrappers

---

## CLI (Commander.js)

- Entry: `src/cli/index.ts`
- Program created with `new Command()`; `program.parse()` called at module level
- Unused args/opts prefixed with `_`: `(_profile, _opts)`
- Global flags: `--quiet / -q`, `--json / -j`, `--no-cache`, `--shell`
- Each subcommand is a fluent chain: `.command(name).description(text).option(...).action(fn)`
- Stubs print `"{command} command - implementation pending"` until implemented

---

## Module Aliases

- No path aliases configured — all imports use relative paths
- Extensions are explicit: `from "../types/index.js"` (`.js` required in ESM)
- Internal imports always include the `.js` extension

---

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

**Do not disable lint rules.** If a rule fires incorrectly, fix the code.

---

## Commit Conventions

```
feat:     new feature
fix:      bug fix
docs:     documentation only
ci:       CI/CD changes
refactor: code restructure, no behavior change
test:     adding/updating tests
```

Squash-merge to `main` after review.

---

## Anti-Patterns to Avoid

- `any` type
- `console.log` / `console.error` in library code
- Non-async top-level await without justification
- Magic numbers (extract to named constants)
- Inline SQL (SQL is defined as module-level `const` strings)
- Missing `.js` extension on ESM imports
- File > 500 LOC

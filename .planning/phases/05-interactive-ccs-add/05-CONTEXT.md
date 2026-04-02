# Phase 5: Interactive `ccs add` + OAuth2 - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the `ccs add` stub with a full interactive TTY flow: name first, then auth type selection, then the appropriate token capture per type. OAuth2 uses copy-paste callback. Add `--token`, `--name`, `--base-url` flags are removed.

</domain>

<decisions>
## Implementation Decisions

### OAuth2 callback
- **D-01:** User copies the callback code from the browser redirect page and pastes it into the CLI prompt
- **D-02:** No local server, no redirect listener — manual copy-paste only

### Flag compatibility
- **D-03:** Remove `--token`, `--name`, `--base-url` flags from `ccs add` — fully interactive from now on
- **D-04:** `ccs add` takes no arguments; any args print usage and exit

### Prompt order
- **D-05:** Order: profile name → auth type → token capture (name first, then auth type)

### OAuth2 retry UX
- **D-06:** On token exchange failure: print error, print the auth URL again, ask user to try the paste again (loop: try again → paste code, or abort)
- **D-07:** Retry loop has no hard limit — user can keep trying or Ctrl+C to abort

### Auth type options
- **D-08:** Three paths: `oauth` (browser → paste code), `manual` (paste API key directly), `env` (read from `$ANTHROPIC_API_KEY`)
- **D-09:** Auth type selection via `@clack/prompts.select()` — three labeled options

### Manual token path
- **D-10:** Masked input via `@clack/prompts.password()` — not echoed to terminal

### Env var path
- **D-11:** Read `$ANTHROPIC_API_KEY` at prompt time — abort with error if not set

### Base URL prompt
- **D-12:** Optional — press Enter to skip (default: no base URL)
- **D-13:** No validation of URL format at this stage (Phase 6 will handle switch integration)

### `ccs list` auth badge
- **D-14:** Show auth method per profile: `[oauth]`, `[manual]`, `[env]` in the list output

### Claude's Discretion
- Exact prompt wording and messages
- Error message phrasing
- How to structure the OAuth exchange code (method naming, etc.)
- Test approach for interactive prompts

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Existing code
- `.planning/PROJECT.md` — Core Value, Constraints (Bun, TypeScript strict, Commander.js v12)
- `.planning/REQUIREMENTS.md` — Requirements ADD-01–05, OAUTH-01–05, MANUAL-01–02, ENV-01–03, LIST-01
- `.planning/ROADMAP.md` §Phase 5 — Phase goal, success criteria, plan structure
- `src/cli/commands/add.ts` — existing stub to replace (currently interactive for name+token, no branching)
- `src/types/index.ts` — `Profile` interface, `AddMode` type (`"oauth" | "manual" | "env"`)
- `src/utils/output.ts` — `info()`, `respondError()`, `warnSecurity()` — use these for all output
- `src/cli/commands/list.ts` — `auth_method` already mapped, add `[badge]` to output
- `src/core/auth.ts` — currently empty stub, new OAuth2 module goes here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@clack/prompts.text()` — already used in `add.ts` for name input
- `@clack/prompts.password()` — masked input (used for manual token)
- `@clack/prompts.select()` — auth type selector (not yet used)
- `@clack/prompts.confirm()` — retry loop confirmation
- `getDatabase()` / `db.createProfile()` — already wired
- `encryptForStorage()` — already wired

### Established Patterns
- `touchSession()` called at top of every command
- `getFlags(cmd)` for flag access
- `respondError()` for errors (never throws)
- Guard: `if (!profileName) respondError(...)`
- Profile uniqueness check before write

### Integration Points
- `src/core/auth.ts` — new OAuth2 module (build here first, then wire into `add.ts`)
- `src/cli/commands/add.ts` — replace existing stub, add auth-type branching
- `src/cli/commands/list.ts` — add auth method badge to profile line
- `src/core/storage.ts` — `createProfile()` accepts `auth_method`, `base_url` fields (already supported)

</code_context>

<specifics>
## Specific Ideas

- OAuth2 flow: print auth URL → "Open this URL in your browser" message → prompt "Paste the callback code:" → POST exchange → on success: save + confirm; on failure: error + "Try again?" confirm loop
- The `@clack/prompts.select()` options for auth type: `[oauth] Login with browser`, `[manual] Paste API key`, `[env] Read from $ANTHROPIC_API_KEY`
- For `ccs list`: `  work [oauth] (default)  api.anthropic.com/…` format

</specifics>

<deferred>
## Deferred Ideas

- Token encryption (ENC-01) — v0.3
- Token refresh — Phase 13
- `ccs add --update <profile>` — Phase 7
- `ccs login` as standalone command — deferred

</deferred>

---

*Phase: 05-interactive-ccs-add*
*Context gathered: 2026-04-02*

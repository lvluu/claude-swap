# Phase 5: Interactive `ccs add` + OAuth2 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 05-interactive-ccs-add
**Areas discussed:** OAuth2 callback, flag compatibility, prompt order, retry UX

---

## OAuth2 Callback

| Option | Description | Selected |
|--------|-------------|----------|
| Local redirect server | CLI starts a localhost server, browser redirects to it | |
| Copy-paste | Print URL, user visits browser, pastes callback code in CLI | ✓ |

**User's choice:** Copy-paste — simpler, more portable, no port conflicts
**Notes:** No local server. User pastes the callback code (not the full URL) into the CLI.

---

## Flag Compatibility

| Option | Description | Selected |
|--------|-------------|----------|
| Keep flags as shortcuts | `--token`, `--name` still work alongside interactive mode | |
| Remove all flags | Fully interactive, no shortcuts | ✓ |

**User's choice:** Remove all flags — fully interactive from now on
**Notes:** `ccs add` takes no arguments; any args print usage and exit.

---

## Prompt Order

| Option | Description | Selected |
|--------|-------------|----------|
| Auth type → name → token | | |
| Name → auth type → token | Name first, then auth type, then token capture | ✓ |

**User's choice:** Name first
**Notes:** Natural — you name it before deciding how to fill it.

---

## Retry UX

| Option | Description | Selected |
|--------|-------------|----------|
| Loop indefinitely | Keep trying until user Ctrl+C or success | ✓ |
| 3 retries then abort | Hard limit | |

**User's choice:** Loop until success or Ctrl+C
**Notes:** "stop and ask user to try again" — means no hard limit, user controls when to abort.

---

## Deferred Ideas

- Token encryption (ENC-01) — v0.3
- Token refresh — Phase 13
- `ccs add --update` — Phase 7

---

*Discussion completed: 2026-04-02*

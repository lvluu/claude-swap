# Requirements: ccs — v0.2 Profile Management + OAuth2

**Defined:** 2026-04-02
**Updated:** 2026-04-02 (v0.2 phase mapping added)
**Core Value:** Switch between Claude API accounts in < 1 second across any terminal, with per-terminal isolation and tokens stored securely.

## v1 Requirements

### Profile Creation (`ccs add`)

- [ ] **ADD-01**: `ccs add` starts interactive TTY prompt flow — no CLI flags required
- [ ] **ADD-02**: First prompt: choose auth type — `oauth` / `manual` / `env`
- [ ] **ADD-03**: After auth type: prompt for profile name
- [ ] **ADD-04**: After name: prompt for base URL (optional, press Enter for none)
- [ ] **ADD-05**: Profile saved with `auth_method`, `token_encrypted`, `base_url`, `name`

### OAuth2 Flow

- [ ] **OAUTH-01**: Print auth/login URL to terminal with instructions
- [ ] **OAUTH-02**: Prompt user to paste the callback code from the redirect page
- [ ] **OAUTH-03**: Exchange code for token via POST to Anthropic token endpoint
- [ ] **OAUTH-04**: On success: save token to profile, show confirmation
- [ ] **OAUTH-05**: On failure: print error, ask "Try again?" — loop or abort

### Manual Token Path

- [ ] **MANUAL-01**: Prompt for API key (masked input via `@clack/prompts`)
- [ ] **MANUAL-02**: Save to profile with `auth_method = 'manual'`

### Env Var Path

- [ ] **ENV-01**: Read `$ANTHROPIC_API_KEY` from current environment
- [ ] **ENV-02**: If not set: print error and abort
- [ ] **ENV-03**: Save to profile with `auth_method = 'env'`

### Base URL

- [ ] **BASE-01**: Store `base_url` in `profiles.base_url` column (nullable)
- [ ] **BASE-02**: `ccs switch <profile>` exports `ANTHROPIC_BASE_URL` env var when base URL is set
- [ ] **BASE-03**: `ccs list` shows base URL if set (abbreviated with `…` if > 30 chars)

### List Display

- [ ] **LIST-01**: `ccs list` shows auth method badge per profile — `[oauth]`, `[manual]`, `[env]`

## v2 Requirements

### Encryption

- **ENC-01**: Tokens encrypted at rest using AES-256-GCM with machine-derived key
- **ENC-02**: Encryption key derived from machine fingerprint, never stored
- **ENC-03**: Re-encrypt existing profiles on first encryption milestone ship

### Token Management

- **REFR-01**: Silent token refresh on `ccs switch` if access token is expired
- **REFR-02**: Refresh token stored in `profile.metadata` (encrypted)
- **REFR-03**: Re-auth prompt if refresh token is also expired

### Shell Integration

- **SHEL-03**: New terminal windows auto-activate default profile (shell init script)
- **SHEL-04**: `ccs current` shows active profile in current terminal
- **SHEL-05**: `ccs sessions` lists active terminal sessions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Local OAuth redirect server | Adds complexity; manual code paste is simpler and portable |
| PKCE code challenge/verifier | Anthropic OAuth2 doesn't require PKCE for this use case |
| Token refresh in v0.2 | Deferred to after initial OAuth2 ship (Phase 13) |
| `ccs login` as standalone command | `ccs add` covers the flow; separate command is redundant |
| GUI or web interface | CLI only |
| Cloud sync / cross-machine sharing | Machine-bound by design |

## Traceability

### v0.2 Phase Mapping

| Requirement | Phase | Milestone | Status |
|-------------|-------|-----------|--------|
| ADD-01 | Phase 5 | v0.2 | Pending |
| ADD-02 | Phase 5 | v0.2 | Pending |
| ADD-03 | Phase 5 | v0.2 | Pending |
| ADD-04 | Phase 5 | v0.2 | Pending |
| ADD-05 | Phase 5 | v0.2 | Pending |
| OAUTH-01 | Phase 5 | v0.2 | Pending |
| OAUTH-02 | Phase 5 | v0.2 | Pending |
| OAUTH-03 | Phase 5 | v0.2 | Pending |
| OAUTH-04 | Phase 5 | v0.2 | Pending |
| OAUTH-05 | Phase 5 | v0.2 | Pending |
| MANUAL-01 | Phase 5 | v0.2 | Pending |
| MANUAL-02 | Phase 5 | v0.2 | Pending |
| ENV-01 | Phase 5 | v0.2 | Pending |
| ENV-02 | Phase 5 | v0.2 | Pending |
| ENV-03 | Phase 5 | v0.2 | Pending |
| BASE-01 | Phase 6 | v0.2 | Pending |
| BASE-02 | Phase 6 | v0.2 | Pending |
| BASE-03 | Phase 6 | v0.2 | Pending |
| LIST-01 | Phase 5 | v0.2 | Pending |

### Historical Coverage (all requirements)

| Requirement | Phase | Status |
|-------------|-------|--------|
| ADD-01 | 5 | 🚧 Planned v0.2 |
| ADD-02 | 5 | 🚧 Planned v0.2 |
| ADD-03 | 5 | 🚧 Planned v0.2 |
| ADD-04 | 5 | 🚧 Planned v0.2 |
| ADD-05 | 5 | 🚧 Planned v0.2 |
| OAUTH-01 | 5 | 🚧 Planned v0.2 |
| OAUTH-02 | 5 | 🚧 Planned v0.2 |
| OAUTH-03 | 5 | 🚧 Planned v0.2 |
| OAUTH-04 | 5 | 🚧 Planned v0.2 |
| OAUTH-05 | 5 | 🚧 Planned v0.2 |
| MANUAL-01 | 5 | 🚧 Planned v0.2 |
| MANUAL-02 | 5 | 🚧 Planned v0.2 |
| ENV-01 | 5 | 🚧 Planned v0.2 |
| ENV-02 | 5 | 🚧 Planned v0.2 |
| ENV-03 | 5 | 🚧 Planned v0.2 |
| BASE-01 | 6 | 🚧 Planned v0.2 |
| BASE-02 | 6 | 🚧 Planned v0.2 |
| BASE-03 | 6 | 🚧 Planned v0.2 |
| LIST-01 | 5 | 🚧 Planned v0.2 |
| ENC-01 | 1 | ✅ Shipped v0.1 |
| ENC-02 | 1 | ✅ Shipped v0.1 |
| REFR-01 | 13 | 📋 Planned |
| REFR-02 | 13 | 📋 Planned |
| REFR-03 | 13 | 📋 Planned |
| SHEL-03 | 14 | 📋 Planned |
| SHEL-04 | 14 | 📋 Planned |
| SHEL-05 | 14 | 📋 Planned |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓
- v0.2 milestone: 16 requirements in Phases 5–6

---
*Requirements defined: 2026-04-02 | v0.2 phase mapping added: 2026-04-02*

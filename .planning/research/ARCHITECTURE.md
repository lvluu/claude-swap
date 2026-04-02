# Architecture Research — OAuth2 Profile Management

**Layer:** Research (GSD Phase 0)
**Status:** Complete
**Codebase snapshot:** 2026-04-02

---

## 1. Where OAuth2 Fits in the Profile Creation Flow

The existing `add.ts` flow has three phases:

```
collect inputs → encrypt token → write to DB
```

OAuth2 injects a **token acquisition phase** between collect and encrypt. The raw token coming out of OAuth exchange is a `refresh_token` (or short-lived `access_token`); the `access_token` is what gets encrypted and stored. The `refresh_token` is used to re-acquire `access_token`s on expiry — it must also be encrypted and stored.

```
collect inputs (with OAuth2) → exchange for tokens → encrypt access_token → write to DB
```

The downstream `add.ts` change is minimal: the `auth_method` field becomes `"oauth"` instead of `"manual"`, and `base_url` may be set automatically from the OAuth issuer discovery document.

---

## 2. Integration Points with Existing Code

### 2.1 Schema — no changes needed

The `profiles` table already has every column OAuth2 needs:

| Column | Used by OAuth2 |
|---|---|
| `token_encrypted` | Stores encrypted `access_token` (existing) |
| `base_url` | Stores custom API base URL from OAuth discovery (existing, nullable) |
| `auth_method` | Set to `"oauth"` (existing enum value) |
| `metadata` | Stores encrypted `refresh_token`, OAuth `client_id`, `expires_at`, scopes |

`metadata` (JSON column) is the right vehicle for OAuth-specific secrets because it avoids a schema migration. The `encryption.ts` module already handles `encryptSync` / `decryptSync` — refresh tokens go through the same path.

### 2.2 `src/core/encryption.ts` — no changes needed

`encryptForStorage` / `decryptFromStorage` are storage-format agnostic. Both access tokens and refresh tokens can be passed in as plaintext strings.

### 2.3 `src/core/storage.ts` — no changes needed

`db.createProfile(profile)` and `db.updateProfile(id, updates)` accept the existing `Profile` interface unchanged. OAuth2 just sets `metadata: { oauth: { refresh_token: "...", ... } }`.

### 2.4 `src/core/switch.ts` — minor change (activation time)

`activateProfile` already decrypts `token_encrypted` and passes it as `token` to `formatShell`. This works for OAuth tokens verbatim — they are just strings to the shell layer.

The **new responsibility** at activation time: if `profile.auth_method === "oauth"` and the stored `access_token` has expired, `switch.ts` should automatically call the refresh flow and update the DB before exporting. This is a new guard added to the existing `activateProfile` function (~5–8 lines).

### 2.5 `src/core/env-output.ts` — minor change (`ANTHROPIC_BASE_URL` export)

`formatShell` currently emits only `ANTHROPIC_AUTH_TOKEN`. When a profile has a `base_url`, a second line should be added:

```typescript
export function formatShell(profile: Profile, token: string): string {
  const lines = [`export ${ENV_VAR}="${token.replace(/"/g, '\\"')}"`];
  if (profile.base_url) {
    lines.push(`export ANTHROPIC_BASE_URL="${profile.base_url}"`);
  }
  return lines.join("\n");
}
```

`writeLocalEnv` gets the same treatment. `formatPersistent` needs no change — it writes `CCS_PROFILE` only; the caller reads `ANTHROPIC_BASE_URL` from the shell environment when set.

### 2.6 `src/cli/commands/add.ts` — primary modification target

The `addCommand` function needs a new branch: when `--oauth` flag is present, delegate to the new OAuth2 command module instead of collecting a manual token via `text()`. The diff surface is small — a conditional that skips the token prompt and calls the OAuth orchestrator.

---

## 3. New Components

### 3.1 `src/core/oauth2.ts` — OAuth2 token exchange (NEW, ~200–280 LOC)

The central new module. Exposes a stateless function:

```typescript
export interface OAuth2Tokens {
  access_token: string;
  refresh_token: string;   // may be absent for token refresh only
  expires_at: number;      // Unix ms timestamp
  scope: string;
}

export interface OAuth2Options {
  issuer?: string;         // default: "https://auth.anthropic.com"
  clientId?: string;       // default: "Claude Code CLI"
  scope?: string;
  baseUrl?: string;        // derived from OAuth discovery
  port?: number;           // for callback server, default: 19710
  profileName: string;
}

/**
 * Runs the OAuth2 Authorization Code + PKCE flow.
 * - Opens browser to authorization URL
 * - Starts local HTTP server to receive callback
 * - Exchanges authorization code for tokens
 * - Returns tokens (encrypted by caller before storage)
 */
export async function acquireTokens(opts: OAuth2Options): Promise<OAuth2Tokens>;
```

**Internals — Authorization Code + PKCE path (fallback if Device Code Flow unavailable):**

1. **PKCE generation** — `generatePKCE()`: generates `code_verifier` (43–128 chars per RFC 7636), derives `code_challenge` via S256 (`BASE64URL(SHA256(code_verifier))`).
2. **OAuth discovery** — `fetchOpenIdConfiguration(issuer)` fetches `/.well-known/openid-configuration` to get `authorization_endpoint`, `token_endpoint`, `revocation_endpoint`. Result is cached in the `settings` table keyed by issuer.
3. **Authorization URL construction** — `buildAuthorizationUrl(opts, code_challenge)`:
   ```
   GET {issuer}/oauth/authorize
     ?response_type=code
     &client_id={clientId}
     &redirect_uri=http://localhost:{port}
     &code_challenge={codeChallenge}
     &code_challenge_method=S256
     &scope={scope}
   ```
4. **Callback server** — `startCallbackServer(port)` creates a one-shot HTTP server that resolves a `Deferred<{ code: string, state: string }>` when `/callback?code=…&state=…` is hit. `state` from the URL is verified against the expected value. Server shuts down immediately after first valid request.
5. **Token exchange** — `exchangeCode(code, code_verifier, redirect_uri)` → `POST {token_endpoint}` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`. Handles `invalid_grant` (expired code) with a user-facing error.
6. **Browser opening** — `openBrowser(url)` via `Bun.env.BROWSER` or `xdg-open` / `open` / `start` fallback.

**Internals — Device Code Flow path (preferred, see Section 6.1):**

```typescript
// 1. POST /device/code → { device_code, user_code, verification_uri, interval }
const { device_code, user_code, verification_uri, interval } =
  await fetchDeviceCode(config.device_endpoint, opts.client_id, opts.scope);
// 2. Print: "Visit {verification_uri} and enter code {user_code}"
// 3. Poll /token every `interval`s until { access_token } or error
return pollForToken(config.token_endpoint, opts.client_id, device_code, interval);
```

**Error handling contract** (matches existing `EncryptionError` patterns):

- Invalid PKCE input → throws `OAuth2Error("Invalid PKCE parameters")`
- Discovery fetch fails → throws `OAuth2Error("Cannot reach OAuth issuer")`
- Authorization code expired → throws `OAuth2Error("Authorization code expired — please try again")`
- Token exchange fails → throws `OAuth2Error("Token exchange failed: " + error.message)`
- Port in use → throws `OAuth2Error("Port {port} unavailable — specify --port")`

### 3.2 `src/core/oauth2-store.ts` — OAuth persistence helpers (NEW, ~80 LOC)

```typescript
export interface OAuthMetadata {
  refresh_token_encrypted: string;
  expires_at: number;       // Unix ms
  issuer: string;
  client_id: string;
  scope: string;
}

/** Reads OAuth sub-field from a profile's metadata. Returns null if not OAuth profile. */
export function getOAuthMetadata(profile: Profile): OAuthMetadata | null;

/** Persists a refreshed access token (token_encrypted) and new expiry in metadata. */
export function updateAccessToken(
  profileId: string,
  newAccessToken: string,
  newExpiresAt: number,
): void;
```

This module serializes/deserializes the `metadata.oauth` sub-field and calls `db.updateProfile`. Thin — no network calls, no crypto beyond what `encryption.ts` already does.

### 3.3 `src/core/token-refresh.ts` — Silent refresh (NEW, ~60 LOC)

```typescript
/**
 * If the profile is OAuth-based and the access_token is expired (or within
 * `graceMs` of expiry), attempts a silent refresh via the stored refresh_token.
 * Returns the current (possibly refreshed) access token string.
 * Throws OAuth2Error if refresh fails — caller handles re-auth prompt.
 */
export async function getValidAccessToken(
  profile: Profile,
  graceMs?: number,  // default: 60_000 (refresh if < 60s left)
): Promise<string>
```

This is the guard wired into `switch.ts activateProfile`. No changes to the session table — only the token in the profiles row.

### 3.4 `src/cli/commands/oauth.ts` — OAuth sub-flow (NEW, ~120 LOC)

Driven by `add.ts` when `auth_method === "oauth"`. Orchestrates:

```
select issuer (interactive) → acquireTokens() →
encrypt both tokens → build Profile object → db.createProfile()
```

Reuses existing TUI components (`text`, `confirm`, `spinner` from `@clack/prompts`) following the established pattern in `add.ts`.

### 3.5 `src/utils/open-browser.ts` — Browser launch helper (NEW, ~30 LOC)

Cross-platform browser launch via `Bun.env.BROWSER` or `xdg-open` / `open` / `start` fallback. Exposed as `openBrowser(url: string): void`. No network calls.

---

## 4. How `base_url` is Plumbed Through `ccs switch`

Today `base_url` is stored but **not consumed** — `switch.ts` exports only `ANTHROPIC_AUTH_TOKEN`. The `ccs switch` path for OAuth-aware profiles adds one export line per activation:

```
ccs switch myprofile --shell
→ activateProfile()
  → getValidAccessToken()  [may silently refresh if expired]
  → formatShell(profile, token)
      → export ANTHROPIC_AUTH_TOKEN="sk-ant-..."
      → export ANTHROPIC_BASE_URL="https://api.anthropic.com/"   ← NEW, only if set
```

The two-line change to `formatShell` (Section 2.5) covers the output format. No changes to `switch.ts` routing logic — `formatShell` already receives the full `Profile` object.

The `base_url` value comes from:

| Priority | Source | How populated |
|---|---|---|
| 1 | `--base-url` flag | Explicit, passed through `add.ts` |
| 2 | OAuth discovery `api_endpoint` | Extracted from OpenID configuration response |
| 3 | OAuth discovery `issuer` field | Used as base URL if no `api_endpoint` |
| 4 | Default | Falls back to `https://api.anthropic.com/` |

OAuth discovery response is fetched once per issuer and cached in the `settings` table.

---

## 5. Suggested Build Order

This order respects existing patterns (ESM, Bun native, TypeScript strict) and minimizes risk at each step:

### Step 1 — `src/utils/open-browser.ts` + `src/core/oauth2.ts` (PKCE/discovery)
**Why first:** No coupling to the rest of the system. Pure functions, no DB calls. Establishes the `OAuth2Tokens` contract that all downstream code depends on.

**Acceptance:** `acquireTokens({ issuer, profileName })` completes a full flow against a real OAuth server (or test mock) without touching the database.

### Step 2 — `src/core/oauth2-store.ts`
**Why second:** Encodes the `metadata.oauth` field shape. No changes to existing code yet.

**Acceptance:** `getOAuthMetadata(profile)` returns correctly typed data; `updateAccessToken` persists a refreshed token to the DB.

### Step 3 — `src/core/token-refresh.ts`
**Why third:** Depends on `oauth2-store`. No integration with `switch.ts` yet.

**Acceptance:** `getValidAccessToken` returns the stored token for unexpired profiles; throws `OAuth2Error` for expired profiles with no stored refresh token.

### Step 4 — `src/cli/commands/oauth.ts` + wire into `add.ts`
**Why fourth:** Depends on Steps 1–3. Touches `add.ts` but only adds a new branch; existing `manual` path is unaffected.

**Acceptance:** `ccs add --oauth --name test` completes the OAuth flow, stores encrypted tokens, `ccs list` shows `auth_method: oauth`.

### Step 5 — `src/core/env-output.ts` (`ANTHROPIC_BASE_URL` export)
**Why fifth:** Trivially isolated. No dependency on OAuth modules.

**Acceptance:** `formatShell(profile_with_base_url, token)` returns a two-line export string. `formatShell` without `base_url` is unchanged (backwards-compatible).

### Step 6 — `src/core/switch.ts` (auto-refresh guard)
**Why sixth:** Depends on Steps 2, 3, 5. Adds the auto-refresh check to the existing activation path.

**Acceptance:** Switching an expired OAuth profile silently re-acquires an access token and exports it without error; switching a non-expired profile is unchanged.

---

## 6. Key Design Decisions

### 6.1 Prefer Device Code Flow Over Browser Callback

Anthropic supports [Device Authorization Grant (RFC 8628)](https://datatracker.ietf.org/doc/html/rfc8628) which avoids a local server entirely.

**Recommendation: implement Device Code Flow first.** Fall back to Authorization Code + PKCE if the issuer does not advertise a `device_endpoint` in its OpenID configuration.

Rationale for Device Code Flow:
- No port conflicts or firewall issues on non-standard ports
- Works in headless environments (SSH, containers, remote VMs)
- No browser dependency on the local machine
- User experience is acceptable: `ccs add --oauth` prints a URL + code, user visits on any device with a browser
- More OAuth provider-friendly (some providers restrict `localhost` redirect URIs)

Revised `acquireTokens` pseudocode (Device Code Flow primary):

```typescript
export async function acquireTokens(opts: OAuth2Options): Promise<OAuth2Tokens> {
  const config = await fetchOpenIdConfiguration(opts.issuer ?? DEFAULT_ISSUER);

  // Try Device Code Flow first
  if (config.device_endpoint) {
    const { device_code, user_code, verification_uri, interval } =
      await fetchDeviceCode(config.device_endpoint, opts.client_id, opts.scope);
    print(`Visit: ${verification_uri}`);
    print(`Enter code: ${user_code}`);
    return pollForToken(config.token_endpoint, opts.client_id, device_code, interval);
  }

  // Fall back to Authorization Code + PKCE
  return authorizeWithPKCE(opts, config);
}
```

### 6.2 Token Storage Split: Access vs Refresh

```
profiles.token_encrypted    → encrypted access_token (hot path: decrypt → export)
profiles.metadata.oauth.refresh_token_encrypted → encrypted refresh_token
profiles.metadata.oauth.expires_at              → Unix ms timestamp
```

Rationale: The hot path (`decryptFromStorage(profile.token_encrypted)`) always returns an access token — `switch.ts` is already written for this. Refresh tokens are secondary, accessed only when `getValidAccessToken` detects expiry.

### 6.3 `base_url` Source Priority

```
explicit --base-url flag > OAuth discovery "api_endpoint" > OAuth discovery "issuer" > default
```

OAuth discovery is performed once per issuer and cached in the `settings` table (`getSetting("oauth:config:{issuer}")`).

### 6.4 No Background Daemon

Token refresh happens at `ccs switch` time, not in a background process. If a token expires mid-session, the next `ccs switch` triggers refresh. This is consistent with the stateless CLI design — no PID management, no lifecycle issues.

### 6.5 Error Propagation Strategy

OAuth2 errors propagate as typed `OAuth2Error` exceptions through all layers. `switch.ts` catches them and surfaces the message via `respondError`. The `add.ts` OAuth branch catches and re-prompts rather than failing.

---

## 7. Open Questions to Resolve Before Implementation

| # | Question | Impact | Resolution Path |
|---|---|---|---|
| 1 | Does Anthropic's OAuth server support Device Code Flow? | High — determines primary flow | Check `/.well-known/openid-configuration` for `device_endpoint`; check [Anthropic developer docs](https://docs.anthropic.com) |
| 2 | What is the OpenID Connect / OAuth2 discovery endpoint? | High — `acquireTokens` needs this URL | Check `https://auth.anthropic.com/.well-known/openid-configuration` |
| 3 | What `client_id` should the CLI use? | High — required for all flows | May need to register a public client or use a known CLI `client_id` |
| 4 | What is the `refresh_token` TTL? | Medium — affects `expires_at` storage and refresh UX | Check token endpoint response or docs |
| 5 | What OAuth scopes are required? | Low — `api` scope is likely sufficient | Check supported scopes in discovery document |
| 6 | Should `ccs remove --revoke` also revoke the OAuth token? | Medium — security/cleanup concern | Add revocation call to `/revocation_endpoint` if available |
| 7 | Does `base_url` map directly from OAuth discovery `issuer`, or is there a separate `api_endpoint`? | Low — easy to adjust once known | Will be clear from discovery document |

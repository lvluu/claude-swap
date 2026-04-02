# Features Research — OAuth2 Profile Management

**Goal**: Define what OAuth2 profile management requires for `ccs add --oauth` (AUTH-01), what already exists in the codebase, and what new infrastructure is needed.

**Context**: Substantially built project. `ccs add --token` already works end-to-end with encryption. OAuth adds a browser-based token acquisition path. This doc focuses ONLY on that delta.

**Web search blocked in this environment** — OAuth2 flow details are derived from: (a) standard RFC 6749 / RFC 7636 knowledge, (b) what `claude login` is known to do publicly, (c) what the existing schema and code can already express. Sections where Anthropic-specific details are unknown are explicitly marked **[ANTHROPIC: TBD]**.

---

## 1. What Is Already in Place

### Schema

The `profiles` table and `Profile` interface already support OAuth:

```sql
auth_method TEXT NOT NULL DEFAULT 'manual'  -- 'oauth' | 'manual' | 'env'
token_encrypted TEXT NOT NULL DEFAULT ''     -- stores the OAuth access_token
```

The field is **the same column** as manual tokens — after OAuth exchange, the resulting `access_token` is encrypted and stored identically. No schema change required.

### Encryption

`encryptForStorage()` / `decryptFromStorage()` are already wired into `add.ts`. The OAuth token path calls the same storage layer.

```typescript
// src/cli/commands/add.ts:76 — already:
const encryptedToken = encryptForStorage(token as string);
```

### Existing `add` Command Scaffolding

`add.ts` is already interactive and already handles:
- `--token` / `--name` / `--base-url` flags
- `--oauth` is typed as `AddMode` but has no handler yet
- Profile uniqueness check
- Encryption + DB write

**What `add.ts` needs to change**: accept `--oauth` flag, branch to `captureOAuthToken()` (new in `auth.ts`), store result with `auth_method: "oauth"`.

---

## 2. OAuth2 Flow — What the CLI Must Do

OAuth2 for native/CLI apps uses the **Authorization Code flow with PKCE** (RFC 7636). The CLI acts as a "public client" — no client secret. This is the same pattern used by GitHub CLI, Google Cloud SDK, and likely Claude's own `claude login`.

### Step-by-Step Sequence

```
CLI                              Browser/Auth Server              Token Endpoint
 │                                        │                              │
 │  1. Generate PKCE code_verifier        │                              │
 │  2. Build authorize URL                │                              │
 │  3. Open browser to authorize URL ────▶                              │
 │                                        │  User logs in + consents      │
 │                                        │◀──────────────────────────────│
 │                                        │                              │
 │  4. Auth server redirects to ──────────▶ localhost callback           │
 │     localhost:PORT/?code=AUTH_CODE      │  (CLI is listening here)     │
 │                                        │                              │
 │  5. POST /oauth/token ────────────────────────────────────────────────▶
 │     code=AUTH_CODE                     │                              │
 │     &code_verifier=VERIFIER             │                              │
 │     &grant_type=authorization_code      │                              │
 │                                        │◀────────────────────────────────
 │  6. Receive: { access_token, expires_in, ... }                        │
 │  7. Encrypt + store access_token                                     │
 │  8. Close browser tab / localhost listener                           │
```

### 3.1 Authorize URL — Required Parameters

```
GET https://auth.anthropic.com/oauth/authorize
  ?response_type=code
  &client_id=<CLIENT_ID>               [ANTHROPIC: TBD what value to use]
  &redirect_uri=http://localhost:PORT    [ANTHROPIC: TBD what port is expected]
  &scope=<SCOPES>                       [ANTHROPIC: TBD what scopes]
  &state=<random_csrf_token>            [security: must be verified on return]
  &code_challenge=<BASE64URL(SHA256(code_verifier))>
  &code_challenge_method=S256
```

**[ANTHROPIC: TBD]**:
- `client_id` — Is there a public/client-side `client_id` for CLI tools, or does the user register one?
- `redirect_uri` — Does Anthropic allow `http://localhost`? What port range/fixed port?
- `scope` — What token scopes are issued? (`profile:read`? `messages:write`?)

### 3.2 Token Exchange — Required Parameters

```
POST https://auth.anthropic.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTH_CODE_FROM_REDIRECT
&redirect_uri=http://localhost:PORT
&client_id=<CLIENT_ID>
&code_verifier=PKCE_CODE_VERIFIER
```

Expected response:
```json
{
  "access_token": "sk-ant-...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "refresh_token": "...",
  "scope": "..."
}
```

**[ANTHROPIC: TBD]**: Token endpoint URL, whether `sk-ant-...` is the `access_token` format or if there's a separate API key format.

### 3.3 PKCE Code Verifier Generation

```typescript
// 43–128 chars from [A-Z, a-z, 0-9, "-", ".", "_", "~"]
const codeVerifier = Buffer.from(crypto.randomBytes(64)).toString("base64url");

// SHA256 hash, base64url-encoded
const codeChallenge = Buffer.from(
  createHash("sha256").update(codeVerifier).digest()
).toString("base64url");
```

### 3.4 Redirect Listener

- CLI binds `http://localhost:${PORT}` — ephemeral port preferred (let OS assign via port=0).
- Must handle exactly one successful redirect, then close.
- Timeout: 5 minutes, then abort with user-friendly error.
- `state` parameter: generate random 32-byte hex, verify exact match on callback to prevent CSRF.

---

## 3. Profile Fields — What Each Auth Method Sets

| Field | `manual` | `oauth` | `env` |
|-------|----------|---------|-------|
| `token_encrypted` | User-provided API key | OAuth `access_token` | Env var value | `auth_method` | `"manual"` | `"oauth"` | `"env"` |
| `base_url` | `--base-url` flag / null | null / same default | null |
| `metadata` | `{}` | `{ oauth_state, oauth_expiry?, refresh_token? }` | `{}` |

**`metadata` for OAuth** — potentially stores:
```typescript
// For token refresh support (Phase 5+)
metadata: {
  refresh_token?: string;       // encrypted separately or stored in settings
  token_expires_at?: number;   // unix ms timestamp
  oauth_state?: string;        // CSRF state (not persisted across processes)
}
```

---

## 4. Feature Classification

### Table Stakes (for OAuth to work)

| # | Feature | Status | Complexity |
|---|---------|--------|------------|
| TS-O1 | `ccs add --oauth` CLI flag + branch | Needs implementation | LOW |
| TS-O2 | `captureOAuthToken()` in `auth.ts` | Empty file — needs implementation | MED |
| TS-O3 | PKCE code verifier + challenge generation | New utility needed | LOW |
| TS-O4 | Local HTTP redirect listener | New utility needed | MED |
| TS-O5 | State parameter CSRF protection | LOW |
| TS-O6 | Store token with `auth_method = "oauth"` | Trivial — one field change in `add.ts` | LOW |

### Differentiators (Phase 5+)

| # | Feature | Rationale | Complexity |
|---|---------|-----------|------------|
| DFT-O1 | **Token refresh** — `ccs refresh` command | OAuth tokens expire. Manual tokens typically don't. Without refresh, `--oauth` profiles go stale. | MED |
| DFT-O2 | **Re-auth without re-prompt** — refresh_token flow | If user has a valid refresh_token, `ccs add --oauth` could be silent for existing profiles. | MED |
| DFT-O3 | **`ccs login`** — dedicated top-level command | A `claude login` equivalent (`ccs login --browser`) decouples OAuth from profile creation. Profile creation can then reference "the logged-in session." | MED |

### Anti-Features

| # | Feature | Reason |
|---|---------|--------|
| ANTI-O1 | OAuth token storage unencrypted | Defeats the machine-bound encryption model. All tokens must be encrypted. |
| ANTI-O2 | Background polling for token expiry | Session-level tracking only. Token refresh is on-demand, not background. |
| ANTI-O3 | Storing refresh_token in a separate table | Simplicity: if refresh is needed, store in `metadata` JSONB column. No new tables until there's evidence of scale. |

---

## 5. Implementation Dependencies on Existing Code

```
src/core/auth.ts                          ← captureOAuthToken() (NEW — currently empty)
src/cli/commands/add.ts                   ← --oauth flag + auth_method: "oauth" (MINIMAL CHANGE)
src/core/storage.ts                        ← No change needed (schema already has auth_method)
src/core/encryption.ts                     ← No change needed (reuse encryptForStorage)
src/types/index.ts                         ← AddMode already typed as "oauth" | "manual" | "env"
```

**Dependency chain**:
```
add --oauth flag (add.ts)
  └── captureOAuthToken() (auth.ts, new)
        ├── buildAuthorizeUrl() (new utility, auth.ts)
        ├── openBrowser() (new utility, auth.ts)
        ├── startRedirectListener() (new utility, auth.ts)
        └── exchangeCodeForToken() (new utility, auth.ts)
              └── encryptForStorage() (encryption.ts, exists)
```

**No new dependencies required** — Bun's built-in `fetch`, `crypto`, and `http` are sufficient. No external packages needed for OAuth.

---

## 6. Complexity Breakdown

| Component | Complexity Driver | Estimate |
|-----------|-------------------|----------|
| PKCE utilities (verifier, challenge, state) | Standard crypto — copy-paste from RFC 7636 sample | LOW |
| Redirect listener (`http.createServer`) | Port conflicts, timeout handling, IPv6 vs IPv4, multiple redirect handling | MED |
| Browser launch (` Bun.spawn` + OS open) | Cross-platform (xdg-open on Linux, `open` on macOS, `start` on Windows) | LOW–MED |
| Token exchange HTTP POST | Standard fetch — 1 request | LOW |
| CSRF state validation | String comparison — trivial | LOW |
| `add.ts` flag + branch | 5–10 line change | LOW |

**Total for `--oauth` to work**: ~200 LOC across `auth.ts` + small update to `add.ts`.

**Token refresh (DFT-O1)**: +150 LOC, requires `PUT /oauth/token` endpoint knowledge **[ANTHROPIC: TBD]**.

---

## 7. Open Questions Requiring Anthropic-Specific Answers

These cannot be resolved from general OAuth2 knowledge or the existing codebase:

| # | Question | Why It Matters |
|---|----------|---------------|
| Q1 | What is the authorize URL? | e.g. `https://auth.anthropic.com/oauth/authorize` vs something else |
| Q2 | What is the token endpoint URL? | Needed for code exchange POST |
| Q3 | Is there a `client_id` for CLI tools? | Public clients use a well-known ID; users shouldn't need to register |
| Q4 | Is `http://localhost` an allowed `redirect_uri`? | If not, what's the alternative? |
| Q5 | What port does the redirect use? | Fixed (e.g. 8080) or ephemeral? |
| Q6 | What scopes does the token request need? | Affects URL construction |
| Q7 | What is the token lifetime (`expires_in`)? | Determines if/when refresh is needed |
| Q8 | Is there a refresh token endpoint? | Required for DFT-O1 (token refresh) |
| Q9 | What is the token format? | Is the OAuth `access_token` the same `sk-ant-...` as manual tokens, or different? |
| Q10 | Does `claude login` use the same endpoints? | If so, a `claude login` subprocess capture (as ROADMAP suggests) may be simpler than re-implementing the flow |

**Recommended approach for Q1–Q9**: Run `claude login` in a subprocess and inspect the network traffic (e.g. via `curl` or devtools) to capture the exact URLs and parameters. Or check if Anthropic has published an OAuth developer guide. The CLI capture approach (Q10) is the lowest-risk path if feasible.

---

## 8. Revised `ccs add` Flow

```
ccs add [--name <name>]
  ├─ --token <token>     → existing: encrypt + store with auth_method='manual'
  ├─ --oauth             → NEW: spawn OAuth flow, encrypt + store with auth_method='oauth'
  ├─ --from-env          → existing intent: read ANTHROPIC_API_KEY from env
  └─ (interactive)       → existing: prompts for name + token (manual)

ccs add --oauth --name myprofile
  1. touchSession()                           [exists]
  2. captureOAuthToken() → string (token)     [NEW in auth.ts]
  3. encryptForStorage(token)                 [exists]
  4. db.createProfile({ auth_method: 'oauth' }) [MINIMAL: add one field]
  5. info(flags, "Profile created.")
```

---

*Research complete. Open questions (Q1–Q10) require Anthropic-specific information before the token exchange step can be implemented confidently.*

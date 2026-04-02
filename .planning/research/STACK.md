# Stack Research — OAuth2 Profile Management for CCS

## Status

**Research phase.** Findings are grounded in existing codebase patterns, Bun native APIs, and established ecosystem packages. No web access available to verify live endpoint URLs — those are marked `[VERIFY]` and must be confirmed before implementation.

---

## 1. What Needs to Be Added

### 1.1 URL Opener

**No new library needed — use `execa`.**

Bun's `child_process` does not expose `exec`; `Bun.spawn` requires platform-specific command arrays. `execa` is the de-facto standard for cross-platform shell command execution in TypeScript projects and is used by Claude Code itself. Bun's own test suite also uses `execa` for subprocess management.

```ts
import { execa } from "execa";
await execa("open",   ["https://example.com"]);         // macOS
await execa("xdg-open", ["https://example.com"]);       // Linux
await execa("cmd", ["/c", "start", `""`], { windows: true }); // Windows
```

Or `open` npm package — functionally identical. Prefer `execa` to keep dep surface small.

**Verdict:** Add `execa` as a **prod dependency** (or verify it is already a transitive dep in `bun.lock` before adding).

### 1.2 PKCE Code Generation

**No library needed — Bun/Node native `crypto`.**

The PKCE flow requires:
1. A cryptographically random `code_verifier` (43–128 chars, URL-safe base64)
2. A SHA-256 hash of the verifier, base64url-encoded → `code_challenge`

This is ~10 lines with the `crypto` module already imported in `encryption.ts`:

```ts
import { randomBytes, createHash } from "crypto";

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const hash    = createHash("sha256").update(verifier).digest();
  const challenge = hash.toString("base64url");
  return { verifier, challenge };
}
```

This belongs in `src/core/auth.ts` (new file). No new dep.

### 1.3 HTTP Callback Server

**No library needed — Bun native `Bun.serve`.**

Bun ships a built-in HTTP server:

```ts
import { serve } from "bun";

const server = serve({
  port: 27345,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      server.stop();  // shuts down the server
      return new Response("Token received! You can close this tab.", { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  },
});
```

This is used inside the OAuth flow to receive the `?code=` redirect after the browser step. No new dep. Bun's `serve` also supports `signal` (AbortController) for clean timeouts.

### 1.4 Anthropic Token Exchange (HTTP POST)

**No library needed — native `fetch`.**

Bun ships a fully-spec-compliant `fetch` with `Headers`, `Request`, and `Response`. The Anthropic token exchange is a standard `POST application/x-www-form-urlencoded`:

```ts
const response = await fetch("https://auth.anthropic.com/oauth/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type:    "authorization_code",
    code,
    code_verifier: pkce.verifier,
    client_id:     "claude-code-swap",
    redirect_uri:  `http://localhost:${PORT}/callback`,
  }),
});
const { access_token } = await response.json() as { access_token: string };
```

No new dep. Bun's `fetch` also supports `AbortSignal` for server-loop timeouts.

### 1.5 Anthropic SDK

**Do not add the full Anthropic SDK.**

The SDK (`@anthropic-ai/sdk`) is designed for API consumers who call Claude. For a token-exchange CLI, the job is:
1. Exchange authorization code for token (fetch POST)
2. Encrypt and store token (existing `encryptForStorage`)
3. Inject into environment (existing `env` command)

The SDK is not needed. Token exchange + storage handles the full OAuth integration surface.

---

## 2. Integration Points

### 2.1 New File: `src/core/auth.ts`

```
Responsibility: PKCE generation, token exchange, OAuth flow orchestration
Depends on:    crypto (native), fetch (native), execa (URL open via shell)
Exposes:
  generatePkcePair(): PkcePair
  exchangeCodeForToken(opts: ExchangeOpts): Promise<string>   // raw token
  runOAuthFlow(opts: OAuthFlowOpts): Promise<string>           // full PKCE + server + exchange
```

### 2.2 Database / Storage — No Changes Required

`db.createProfile()` already accepts `auth_method: "oauth"`. Profiles created during OAuth flow use:
- `token_encrypted` = `encryptForStorage(access_token)` — encrypted at the call site
- `auth_method: "oauth"`
- `metadata` = `{ oauth_refresh_token?: string; oauth_expires_at?: number }` for future refresh use

The `metadata` JSON column handles OAuth-specific fields without schema changes.

### 2.3 `src/cli/commands/add.ts` — Additive Changes Only

The existing `--manual` path is untouched. An `--oauth` branch is added:

```ts
// if --oauth flag is present:
const rawToken = await runOAuthFlow({ baseUrl: baseUrlFromFlag });
const encryptedToken = encryptForStorage(rawToken);  // auth.ts returns raw; caller encrypts
const profile: Profile = {
  // ... other fields ...
  token_encrypted: encryptedToken,
  auth_method: "oauth",
};
db.createProfile(profile);
```

The encryption step stays in the caller's domain — consistent with the existing manual path.

### 2.4 `@clack/prompts` — Already Present

Existing primitives for the OAuth flow:
- `spinner()` — during browser wait and token exchange
- `confirm()` — "Did the browser open successfully?"
- `note()` — display the authorization URL with a copy hint

```ts
import { spinner, confirm, note } from "@clack/prompts";
```

No new dep.

---

## 3. What NOT to Add

| Rejected | Reason |
|---|---|
| `open` npm package | Redundant with `execa` shell invocation; add one or the other, not both |
| `@anthropic-ai/sdk` | Full SDK is unnecessary for token exchange; adds ~500 KB+ bundle |
| `axios` | Bun's native `fetch` covers all HTTP needs; no interceptor overhead |
| `node-fetch` | Not needed — Bun ships spec-compliant fetch natively |
| `jsonwebtoken` | No JWT operations; tokens are opaque |
| `pkce-utils` / `pkce-challenge` | PKCE is ~10 lines of native crypto; a library earns no weight here |
| `express` / `fastify` / `hono` | Callback server is a single endpoint; `Bun.serve` handles it |
| `dotenv` / `env-paths` | Config path already handled via `encryption.ts` constants |

---

## 4. Complete Dependency Delta

### Add to `package.json` dependencies

```json
"execa": "^9.5.2"
```

Verify whether `execa` is already present as a transitive dep via `grep '"execa"' bun.lock` before adding. If already present, no change needed.

### No other production dependencies needed.

### TypeScript — no changes

`execa` ships its own bundled TypeScript definitions. No `@types/` package required.

---

## 5. Architecture Summary

```
OAuth Flow (src/core/auth.ts)
  1. generatePkcePair()          → verifier + challenge  (native crypto)
  2. Build authorization URL     → open browser via execa()
  3. Bun.serve() localhost server → wait for ?code= callback
  4. exchangeCodeForToken()      → POST via native fetch()
  5. Return raw token           → caller encrypts + stores

add.ts (additive patch only)
  → if --oauth flag: call runOAuthFlow()
  → encrypt + db.createProfile({ auth_method: "oauth" })

storage.ts   — unchanged
encryption.ts — unchanged
@clack/prompts — unchanged (existing spinner/confirm/note)
```

---

## 6. Open Questions / `[VERIFY]`

- [ ] **Anthropic OAuth2 authorization endpoint URL** — Confirm whether it is `https://auth.anthropic.com/oauth/authorize`, `https://auth.anthropic.com/oauth/token`, or a separate host. Check [Anthropic auth docs](https://docs.anthropic.com/en/docs/authentication-overview) when web access is available.
- [ ] **OAuth `client_id`** — Is `"claude-code-swap"` acceptable as a client identifier, or does Anthropic require a registered per-app client ID?
- [ ] **Token response shape** — Confirm `{ access_token, refresh_token?, expires_in? }` fields. Add a `OAuthTokenResponse` type to `types/index.ts` once confirmed.
- [ ] **Refresh token handling** — Should refresh tokens be stored in `metadata` for later re-exchange? Plan before storing.
- [ ] **`execa` in lockfile** — Check `bun.lock` for existing `execa` presence before adding it as a direct dep.
- [ ] **Port availability** — `27345` as fixed callback port: confirm it is not in the well-known ephemeral range and does not conflict with any existing `ccs` usage. Make it configurable via env var or `settings` table as a follow-up.

# External Integrations

## Anthropic API (Primary Integration)

| | |
|---|---|
| **Purpose** | Core use case — profile switching sets credentials for Claude Code |
| **Auth Variable** | `ANTHROPIC_AUTH_TOKEN` — set per-profile in the shell environment |
| **Endpoint Variable** | `ANTHROPIC_BASE_URL` — configurable per profile for proxies/custom endpoints |
| **Token Sources** | OAuth flow via `claude login` or manual token entry |

### Custom Endpoints / Proxies

The project is explicitly designed to support third-party API proxies and custom base URLs:

- **Corporate gateways** — internal Anthropic-compatible endpoints
- **Third-party proxies** — services that forward to Anthropic with different pricing or rate limits
- **Self-hosted / local** — local Claude instances, mock APIs, staging environments
- **Config field** — `Profile.base_url?: string` stored in SQLite, written to `ANTHROPIC_BASE_URL`

## Authentication Methods

| Method | Status | Details |
|---|---|---|
| `oauth` | Planned (Phase 2) | Captures token via `claude login` OAuth flow |
| `manual` | Planned (Phase 2) | User-provided API token + optional custom base URL |
| `env` | Planned (Phase 2) | Reads from existing environment variables |

## Databases

| | |
|---|---|
| **SQLite** (native) | `bun:sqlite` — no external driver. WAL mode, foreign keys enabled. Schema: `profiles`, `sessions`, `quotas`, `usage_log`, `settings`. Stored at `~/.config/ccs/data.db` |
| **No external DB** | No PostgreSQL, MongoDB, Redis, or cloud DB dependencies |

## Storage & Persistence

| Type | Details |
|---|---|
| **Local SQLite** | Profiles, sessions, quotas, usage logs |
| **Machine-bound encryption** | AES-256-GCM tokens; key derived from machine fingerprint (`/etc/machine-id`, homedir, hostname, platform, arch, CPU count) |
| **Workspace config** | `.ccsrc` per-directory for local profile binding |
| **OS Keychain** | Planned — OS-native credential storage as an alternative to file-encrypted tokens |

## Security & Crypto

| | |
|---|---|
| **Encryption at rest** | AES-256-GCM |
| **Key derivation** | PBKDF2-SHA512, 100K iterations |
| **Machine fingerprint** | `hostname\|platform\|arch\|cpu_count\|machine-id` (Linux) or `homedir` hash fallback |
| **Encrypted exports** | Password-encrypted JSON profile export planned |
| **No cloud KMS** | All crypto is local / node-level |

## Terminal / OS Integration

| Integration | Details |
|---|---|
| **Terminal sessions** | Tracked in SQLite by terminal name, PID, shell, cwd, last activity |
| **Per-terminal profile** | Independent `ANTHROPIC_AUTH_TOKEN` per terminal session |
| **Shell environment** | `ccs switch --shell` emits shell `export` statements; `--persistent` writes to shell config; `--local` writes `.env` |
| **Clipboard** | Planned — `ccs env --copy` to copy env vars to clipboard |
| **Platform** | macOS, Linux (Windows not explicitly targeted) |

## Planned / Future Integrations

| Integration | Phase | Status |
|---|---|---|
| Claude OAuth (`claude login`) | Phase 2 | Planned |
| OS Keychain (Keychain/macOS, libsecret/Linux) | Phase 6 | Planned |
| Cloud backup (generic cloud storage) | Phase 4 | Planned |
| Workspace `.ccsrc` binding | Phase 5 | Planned |
| Profile rotation with remote quota services | Phase 5 | Planned |

## No Current External Integrations

The following are **not yet integrated** (all are planned future work):

- No API calls to Anthropic at runtime (only token storage + env management)
- No telemetry or analytics external services
- No cloud storage or backup services
- No webhooks
- No OAuth provider except Claude's own login flow (via CLI)
- No CI beyond GitHub Actions (which only runs lint/test, no external services)

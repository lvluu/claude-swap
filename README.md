# Claude Code Swap (ccs)

A high-performance Bun-based CLI/TUI tool for managing Claude Code sessions and profiles.

## Overview

`ccs` provides fast, secure profile management for Claude Code with an intuitive TUI interface, quota tracking, usage analytics, and smart features like profile rotation and workspace integration.

## Features

### Core Commands
- `ccs switch [profile]` - Interactive profile switcher (sets `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`)
- `ccs add` - Add profile via OAuth or manual token (supports custom endpoints)
- `ccs list` - List all profiles with endpoint indicators
- `ccs env [profile]` - Show/copy environment variables for profile
- `ccs export/import` - Export/import profiles as JSON
- `ccs current` - Show active profile and environment

### Custom Endpoints & Proxies
- **API Proxies**: Use third-party proxies for cost savings and rate limit management
- **Custom Base URLs**: Set `ANTHROPIC_BASE_URL` for any endpoint
- **Corporate Gateways**: Enterprise API gateways and self-hosted instances
- **Development**: Local Claude instances, mock APIs, staging environments

```bash
# Add profile with custom endpoint
ccs add --manual \
  --token "sk-ant-api03-xxxxx" \
  --base-url "https://api.example.com/" \
  --name "My Proxy"

# Switch and auto-set env vars
eval $(ccs switch dev@example.com --shell)
# Sets: ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL
```

### Quotas & Analytics
- Daily/monthly token limits per profile
- Usage statistics and visualization
- Cost estimation based on model pricing
- Trend analysis over time

### Smart Features
- Profile groups & tags for organization
- Auto-rotation strategies (round-robin, quota-based, random)
- Workspace-specific profiles (`.ccsrc`)
- Profile health checks (`ccs doctor`)

### Fun Features
- 🔥 Streaks & achievements
- 💼 Profile nicknames with emojis
- 📊 Fun stats (longest session, coffee consumed)
- 💡 Daily profile suggestions based on usage patterns

## Performance

| Operation | Target | Actual (Bun) |
|-----------|--------|--------------|
| Startup | <10ms | ~5ms |
| Profile switch | <20ms | ~12ms |
| List (100 profiles) | <5ms | ~2ms |

## Quick Start

```bash
# Install
bun install -g @anthropic/ccs

# Add a profile
ccs add

# Switch profiles (interactive)
ccs switch

# Switch to specific profile
ccs switch work@example.com

# List all profiles
ccs list

# Export profiles
ccs export profiles-backup.json
```

## Architecture

```
ccs/
├── src/
│   ├── cli/          # CLI commands
│   ├── core/         # Profile, auth, storage
│   ├── tui/          # Interactive interfaces
│   └── utils/        # Helpers
├── package.json
└── README.md
```

**Tech Stack**: Bun + TypeScript + SQLite (native) + @clack/core

## Security

- Tokens encrypted at rest with AES-256-GCM
- PBKDF2 key derivation (100K iterations)
- Optional OS keychain integration
- Encrypted exports with user password

## Documentation

Full plan available at `.omc/plans/ccs-tui-plan.md`

## License

MIT

## Status

🚧 Planning phase - see implementation roadmap in plan document.

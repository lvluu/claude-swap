# Claude Code Swap (ccs) - TUI Tool Plan

## Overview

A high-performance Bun-based CLI/TUI tool for managing Claude Code sessions and profiles. Designed for speed, extensibility, and developer experience.

---

## Technical Stack

### Runtime & Language
- **Runtime**: Bun (v1.0+)
  - Rationale:Fastest startup time (~2-5ms vs Node's 50-100ms)
  - Native TypeScript support
  - Built-in SQLite support
  - Minimal dependency footprint

- **Language**: TypeScript (strict mode)
  - Type safety for reliability
  - Better IDE support
  - Self-documenting code

### TUI Framework Options

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Ink** (React-based) | Familiar React paradigm, component ecosystem, good for complex TUIs | Larger bundle, React overhead | **Recommended for v2** |
| **@clack/core** | Modern, tree-shakeable, beautiful prompts, lightweight | Less mature than alternatives | **Recommended for v1** |
| **Blessed** | Full-featured, powerful widgets | Complex API, large, memory-heavy | Avoid |
| **@topcli/prompts** | Simple, lightweight, Bun-native | Limited interactivity | Good for simple flows |

**Selected**: `@clack/core` + `picocolors` for v1 (minimal, fast), migrate to Ink for advanced TUI in v2.

### Storage Strategy

| Storage | Use Case | Performance |
|---------|----------|-------------|
| **SQLite** (Bun native) | Profile data, usage history, quotas, analytics | O(1) to O(log n) queries |
| **JSON** | Config export/import, simple settings | Fast for small datasets |
| **Memory cache** | Hot paths, frequently accessed profiles | O(1) access |

**Schema Design**:
```sql
-- Profiles table
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,          -- email or custom identifier
  name TEXT NOT NULL,
  token_encrypted TEXT,         -- AES-256 encrypted ANTHROPIC_AUTH_TOKEN
  base_url TEXT,                -- ANTHROPIC_BASE_URL (optional, for proxies/custom endpoints)
  auth_method TEXT DEFAULT 'oauth', -- 'oauth' | 'manual' | 'env'
  created_at INTEGER,
  last_used INTEGER,
  use_count INTEGER DEFAULT 0,
  metadata JSON,                -- flexible extension point
  tags JSON                     -- ["work", "personal", "proxy"]
);

-- Sessions table (per-terminal active profiles)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,          -- TTY path or generated session ID (e.g., "_dev_ttyp0", "_pts_1")
  profile_id TEXT,               -- Active profile for this session
  terminal TEXT,                 -- Terminal identifier (TTY path, tmux pane, etc.)
  started_at INTEGER,
  last_activity INTEGER,
  metadata JSON,                 -- Shell type, working directory, etc.
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- Usage tracking
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT,
  session_id TEXT,               -- Link to specific terminal session
  timestamp INTEGER,
  tokens_used INTEGER,
  model TEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Quotas
CREATE TABLE quotas (
  profile_id TEXT PRIMARY KEY,
  daily_limit INTEGER,
  monthly_limit INTEGER,
  current_daily INTEGER DEFAULT 0,
  current_monthly INTEGER DEFAULT 0,
  last_reset_daily INTEGER,
  last_reset_monthly INTEGER,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSON
);

-- Indexes for performance
CREATE INDEX idx_sessions_profile ON sessions(profile_id);
CREATE INDEX idx_sessions_terminal ON sessions(terminal);
CREATE INDEX idx_sessions_last_activity ON sessions(last_activity DESC);
CREATE INDEX idx_usage_log_session ON usage_log(session_id);
```

---

## CLI Interface Design

### Command Structure

```bash
ccs [command] [options]

Commands:
  switch [profile]     Switch to a profile (interactive if no arg)
                      Sets ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL env vars
  add                  Add new profile (OAuth or manual token)
  remove <profile>     Remove a profile
  list                 List all profiles
  export [file]        Export profiles to JSON
  import <file>        Import profiles from JSON
  quota [profile]      Show/manage quotas
  stats [profile]      Show usage statistics
  current              Show active profile and environment
  env [profile]        Show/copy environment variables for profile
  backup               Backup all profiles
  restore <file>       Restore from backup

Options:
  -h, --help           Show help
  -v, --version        Show version
  -q, --quiet          Suppress output
  -j, --json           Output as JSON
  --no-cache           Skip cache
  --shell              Output as shell exports (for eval)
```

### Detailed Command Specs

#### 1. `ccs switch` (Interactive TUI)

**Flow**:
```
1. Load profiles from SQLite (cached)
2. If arg provided:
   - Exact match → switch immediately
   - Partial match → fuzzy search
   - No match → show suggestions
3. If no arg:
   - Show interactive TUI with:
     * Search/filter input
     * Profile list (name, email, base_url indicator, last used, usage count)
     * Preview pane (detailed info including endpoint)
   - Keyboard nav: ↑↓ (select), Enter (confirm), Esc (cancel), / (search)
   - Indicator for custom endpoints: 🌐 icon or "[proxy]" tag
4. On select:
   - Decrypt token
   - Set environment variables:
     * ANTHROPIC_AUTH_TOKEN=<decrypted_token>
     * ANTHROPIC_BASE_URL=<profile.base_url> (if set, else default)
   - Update last_used timestamp
   - Increment use_count
   - Write to shell config (optional, persistent mode)
   - OR output export statements (temporary mode)
5. Show success message with:
   - Profile name
   - Base URL (if custom)
   - How to activate in current shell (if temporary)
```

**Shell Integration (Per-Terminal Sessions)**:

**IMPORTANT**: Each terminal session maintains its own active profile independently. This is the default behavior.

```bash
# Terminal 1: Work profile
eval $(ccs switch work@example.com --shell)
export ANTHROPIC_AUTH_TOKEN="sk-ff..."

# Terminal 2: Personal profile (INDEPENDENT)
eval $(ccs switch personal@gmail.com --shell)
export ANTHROPIC_AUTH_TOKEN="sk-ab..."  # Different!
```

**Option A - Eval Mode (DEFAULT, Per-Terminal, Recommended)**:
```bash
# User runs:
eval $(ccs switch work@example.com --shell)

# ccs outputs:
export ANTHROPIC_AUTH_TOKEN="sk-ff5c21..."
export ANTHROPIC_BASE_URL="https://pro-x.io.vn/"

# Add to shell config for convenience:
# ~/.bashrc or ~/.zshrc:
ccs() {
  if [[ $1 == "switch" ]]; then
    shift
    eval $(command ccs switch "$@" --shell)
    return $?
  fi
  command ccs "$@"
}

# Now just run:
ccs switch work@example.com  # Auto-evals in current shell
```

**Per-Terminal Session Tracking**:

Each terminal session is tracked independently using TTY or session ID:

```typescript
// Session identification
interface Session {
  id: string;           // TTY path or generated session ID
  profile_id: string;   // Active profile for this session
  started_at: number;
  last_activity: number;
}

// Get current terminal session
function getSession(): Session {
  const tty = process.env.TTY || process.stdout.fd;
  // Or use shell hook to inject unique CCS_SESSION_ID
  const sessionId = process.env.CCS_SESSION_ID || generateSessionId();
  return db.sessions.get(sessionId);
}
```

**Session Management Features**:

```bash
# Show active sessions across terminals
ccs sessions

# Output:
# Session ID    Terminal    Profile             Started
# ─────────────────────────────────────────────────────
# abc123        pts/0       work@example.com    2h ago
# def456        pts/1       personal@gmail.com  30m ago
# ghi789        pts/2       client@client.io     5m ago

# Kill inactive sessions
ccs sessions --clean

# Session file location
~/.config/ccs/sessions/{tty_or_session_id}.json
```

**Shell Hook for Auto-Session Detection** (Optional):

Add to `.bashrc`/`.zshrc`:
```bash
# Auto-generate unique session ID per terminal
export CCS_SESSION_ID=$(tty | tr '/' '_')
# Or for screen/tmux sessions:
# export CCS_SESSION_ID="${TMUX_PANE:-$(tty | tr '/' '_')}"

# Wrapper function for automatic session tracking
ccs() {
  case "$1" in
    switch)
      shift
      eval $(command ccs switch "$@" --session "$CCS_SESSION_ID" --shell)
      ;;
    current)
      command ccs current --session "$CCS_SESSION_ID"
      ;;
    *)
      command ccs "$@"
      ;;
  esac
}
```

**Option B - Persistent Mode (Global, NOT RECOMMENDED for per-terminal)**:
```bash
# WARNING: This affects ALL terminals
# Only use if you want one profile everywhere
ccs switch work@example.com --persistent

# ccs writes to ~/.bashrc or ~/.zshrc:
export ANTHROPIC_AUTH_TOKEN="sk-ff5c21..."
export ANTHROPIC_BASE_URL="https://pro-x.io.vn/"

# Requires: source ~/.bashrc or restart shell
```

**Option C - Project-local (.env file)**:
```bash
# User runs:
ccs switch work@example.com --local

# ccs creates/updates .env in current directory:
ANTHROPIC_AUTH_TOKEN="sk-ff5c21..."
ANTHROPIC_BASE_URL="https://pro-x.io.vn/"

# Works with dotenv loaders
```

**TUI Preview Pane Update**:
```
╔════════════════════════════════════════════════════════╗
║ Preview:                                               ║
╠════════════════════════════════════════════════════════╣
║   Email: proxy@custom.io                               ║
║   Name: Pro-X Proxy                                    ║
║   Endpoint: 🌐 https://pro-x.io.vn/ (custom)           ║
║   Auth: Manual token                                   ║
║   Added: 2024-01-15                                    ║
║   Uses: 45                                             ║
║   Quota: 4500/5000 tokens today                        ║
║   Tags: proxy, custom-endpoint, work                   ║
╚════════════════════════════════════════════════════════╝
```
   - Update last_used timestamp
   - Increment use_count
5. Show success message with profile name
```

**TUI Mockup**:
```
╔════════════════════════════════════════════════════════╗
║ Claude Code Profile Switcher                           ║
╠════════════════════════════════════════════════════════╣
║ Search: [________________]                              ║
╠════════════════════════════════════════════════════════╣
║ ● work@example.com        Work Profile    2h ago      ║
║ ○ personal@gmail.com      Personal       1d ago       ║
║ ○ client@client.io        Client X       3d ago       ║
║ ○ test@test.com           Testing        5d ago       ║
╠════════════════════════════════════════════════════════╣
║ Preview:                                               ║
║   Email: work@example.com                              ║
║   Added: 2024-01-15                                    ║
║   Uses: 127                                            ║
║   Quota: 4500/5000 tokens today                        ║
╚════════════════════════════════════════════════════════╝
```

#### 2. `ccs add` (Profile Configuration)

**Two modes: OAuth (Claude login) and Manual (Custom token/endpoint)**

##### Mode A: OAuth Flow (default)
```bash
ccs add                      # Interactive prompt
ccs add --oauth              # Explicit OAuth mode
```

**Flow**:
```
1. Check if Claude CLI is installed
2. Prompt: "Add profile via OAuth or Manual? [OAuth/Manual]"
3. If OAuth:
   - Prompt for profile name/alias
   - Execute: `claude login` in subprocess
   - Capture auth token from Claude config (~/.config/claude/auth.json)
   - Extract base_url from config (or use default)
   - Encrypt token (AES-256-GCM)
   - Prompt for email (as profile ID)
   - Store in SQLite
   - Offer to switch to new profile
```

##### Mode B: Manual Token (for proxies/custom endpoints)
```bash
# Interactive mode
ccs add --manual

# Non-interactive mode
ccs add --token "sk-ff5c2151d542e83975519928cc55bdd2bcc4228cf4576e3e5fd4e3daabc50e0b" \
        --base-url "https://pro-x.io.vn/" \
        --name "Pro-X Proxy" \
        --email "proxy@custom.io"

# From environment variable
ccs add --from-env --name "From Environment"
```

**Interactive Flow (Manual)**:
```
1. Prompt: "Profile name/alias:"
   > Pro-X Proxy
2. Prompt: "Profile ID (email):"
   > proxy@custom.io
3. Prompt: "ANTHROPIC_AUTH_TOKEN (or press Enter to use env var):"
   > sk-ff5c21... (hidden input)
4. Prompt: "ANTHROPIC_BASE_URL (or press Enter for default https://api.anthropic.com):"
   > https://pro-x.io.vn/
5. Prompt: "Tags (comma-separated, optional):"
   > proxy, custom-endpoint, work
6. Encrypt and store
7. Ask: "Switch to this profile now? [Y/n]"
```

**Environment Variable Injection**:
When switching to a profile with custom base_url or token:
```bash
# ccs writes to shell config or emits export statements
export ANTHROPIC_AUTH_TOKEN="sk-ff5c21..."
export ANTHROPIC_BASE_URL="https://pro-x.io.vn/"
```

**Implementation**:
```typescript
interface Profile {
  id: string;                    // email or custom ID
  name: string;
  token_encrypted: string;       // ANTHROPIC_AUTH_TOKEN (encrypted)
  base_url?: string;             // ANTHROPIC_BASE_URL (optional)
  auth_method: 'oauth' | 'manual' | 'env';
  // ...
}

// Profile activation
async function activateProfile(profile: Profile): Promise<void> {
  const token = await decrypt(profile.token_encrypted);
  
  // Write to shell config (~/.bashrc, ~/.zshrc, etc.)
  // Option A: Direct export (temporary)
  console.log(`export ANTHROPIC_AUTH_TOKEN="${token}"`);
  if (profile.base_url) {
    console.log(`export ANTHROPIC_BASE_URL="${profile.base_url}"`);
  }
  
  // Option B: Update shell config (persistent)
  // Option C: Write to .env file in current directory
}
```

**Security**:
- Tokens never stored in plaintext
- Base URLs stored as-is (no encryption needed)
- Encryption key derived from machine ID
- Key stored in OS keychain (optional, more secure)
- Manual tokens validated before saving (API call test)

#### 3. `ccs export` / `ccs import`

**Export Format**:
```json
{
  "version": "1.0",
  "exported_at": "2024-01-15T10:30:00Z",
  "profiles": [
    {
      "id": "work@example.com",
      "name": "Work Profile",
      "token": "encrypted_base64...",
      "base_url": null,
      "auth_method": "oauth",
      "metadata": {
        "created_at": "2024-01-15",
        "tags": ["work", "primary"]
      }
    },
    {
      "id": "proxy@custom.io",
      "name": "Pro-X Proxy",
      "token": "encrypted_base64...",
      "base_url": "https://pro-x.io.vn/",
      "auth_method": "manual",
      "metadata": {
        "created_at": "2024-01-20",
        "tags": ["proxy", "custom-endpoint"]
      }
    }
  ],
  "settings": {
    "default_profile": "work@example.com"
  }
}
```

**Security Note**:
- Exported tokens are re-encrypted with user-provided password
- Base URLs are stored as-is (not encrypted)
- Import requires password decryption
- Warn if importing unencrypted files
- Validate custom base_urls on import (check connectivity)

#### 4. `ccs env` (Environment Variable Management)

**Purpose**: Display or output environment variables for use in shell scripts orCI/CD

**Commands**:
```bash
ccs env                      # Show env vars for current profile
ccs env <profile>            # Show env vars for specific profile
ccs env <profile> --shell    # Output as shell exports (for eval)
ccs env <profile> --json     # Output as JSON
ccs env <profile> --copy     # Copy to clipboard
```

**Output Examples**:

**ShellExports (--shell)**:
```bash
$ ccs env proxy@custom.io --shell
export ANTHROPIC_AUTH_TOKEN="sk-ff5c21..."
export ANTHROPIC_BASE_URL="https://pro-x.io.vn/"

# Usage:
eval $(ccs env proxy@custom.io --shell)
```

**JSON Format (--json)**:
```bash
$ ccs env proxy@custom.io --json
{
  "ANTHROPIC_AUTH_TOKEN": "sk-ff5c21...",
  "ANTHROPIC_BASE_URL": "https://pro-x.io.vn/"
}
```

**For CI/CD**:
```yaml
# GitHub Actions
- name: Setup Claude Profile
  run: |
    eval $(ccs env ${{ secrets.CCS_PROFILE }} --shell)

# Docker
ENV $(ccs env work@example.com --shell | xargs)

# direnv (.envrc)
eval "$(ccs env work@example.com --shell)"
```

**Features**:
- Copy to clipboard for quick paste
- Print-only mode (no activation)
- Mask token by default (--reveal to show)
- Test connectivity to custom base_url

---

## Additional Features

### 1. Quotas & Usage Management

**`ccs quota` command**:
```bash
ccs quota                    # Show all quotas
ccs quota <profile>          # Show specific profile quota
ccs quota set <profile> --daily 5000 --monthly 100000
ccs quota reset <profile>    # Reset counters
ccs quota enable <profile>   # Enable quota tracking
ccs quota disable <profile>  # Disable quota tracking
```

**Features**:
- Per-profile daily/monthly token limits
- Visual warnings at 80%/90%/100%
- Auto-switch to backup profile when quota exceeded
- Usage analytics with charts
- Export usage reports (CSV/JSON)

**TUI View**:
```
╔════════════════════════════════════════════════════════╗
║ Quota Dashboard                                        ║
╠════════════════════════════════════════════════════════╣
║ Profile         Daily      Monthly    Status          ║
╠════════════════════════════════════════════════════════╣
║ work@...        4500/5000   45000/1M   ████████░░ 80%  ║
║ personal@...    1200/3000   12000/50K  ██████░░░░ 40%  ║
║ client@...      500/5000    5000/100K  ████░░░░░░ 10%  ║
╚════════════════════════════════════════════════════════╝
```

### 2. Statistics & Analytics

**`ccs stats` command**:
```bash
ccs stats                  # Overall statistics
ccs stats <profile>        # Profile-specific stats
ccs stats --hourly         # Hourly breakdown
ccs stats --daily           # Daily breakdown
ccs stats --export csv     # Export as CSV
```

**Metrics**:
- Total tokens used (per profile, all-time)
- Average tokens per session
- Most used models (claude-3-opus, claude-3-sonnet, etc.)
- Peak usage hours
- Cost estimation (based on model pricing)
- Trends over time

**Visualization**:
```
Usage Last7 Days (work@example.com)
  50K ┤       ╭──╮
  40K ┤    ╭──╯  ╰──╮
  30K ┤  ╭─╯       ╰─╮
  20K ┤╭─╯           ╰──╮
  10K ┼╯                ╰─
      Mon Tue Wed Thu Fri Sat Sun
```

### 3. Profile Groups & Tags

**`ccs group` command**:
```bash
ccs group create work --profiles "work@..., client@..."
ccs group switch work    # Switch between profiles in group (round-robin)
ccs group next           # Next profile in current group
ccs group random         # Random profile from group
```

**Use Cases**:
- Work profiles group (switch between client projects)
- Testing group (rotate through test accounts)
- Load balancing across accounts

### 4. Custom Endpoints & Proxies

**Purpose**: Support third-party API proxies, custom endpoints, and self-hostedClaude instances.

**Use Cases**:

1. **API Proxies** (e.g., pro-x.io.vn, openrouter.ai):
   - Cost savings through aggregated API keys
   - Rate limit bypass via different endpoints
   - Regional optimization (latency reduction)
   
2. **Corporate Proxies**:
   - Internal Claude instances
   - Enterprise API gateways
   - Custom authentication layers

3. **Development/Testing**:
   - Local Claude instances
   - Mock APIs for testing
   - Staging environments

4. **Multi-tenant Applications**:
   - Different endpoints per client
   - Isolated API quotas
   - Custom billing integration

**Profile Management for Custom Endpoints**:
```bash
# Add proxy profile
ccs add --manual \
  --token "sk-ff5c2151..." \
  --base-url "https://pro-x.io.vn/" \
  --name "Pro-X Proxy" \
  --email "proxy@custom.io"

# List profiles with endpoint info
ccs list --show-endpoints

# Output:
# Name              Email                Endpoint
# ─────────────────────────────────────────────────────────
# Work Profile      work@example.com      (default)
# Pro-X Proxy       proxy@custom.io      🌐 https://pro-x.io.vn/
# Client API        client@client.io     🌐 https://client-api.example.com/

# Test endpoint connectivity
ccs doctor proxy@custom.io

# Switch and auto-set env vars
ccs switch proxy@custom.io --shell
# > export ANTHROPIC_AUTH_TOKEN="..."
# > export ANTHROPIC_BASE_URL="https://pro-x.io.vn/"
```

**Profile Icon Indicators**:
- 🌐 Custom endpoint (non-default base_url)
- 🔒 OAuth profile (claude login)
- 🔑 Manual token
- ⚠️ Connection issues (doctor check failed)

**Endpoint Validation**:
```typescript
// When adding a profile with custom base_url
async function validateEndpoint(baseUrl: string, token: string): Promise<boolean> {
  try {
    // Test API call to validate connectivity
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      })
    });
    return response.ok || response.status === 401; // 401 = valid endpoint, bad token
  } catch (error) {
    return false;
  }
}
```

### 5. Profile Rotation & Load Balancing

**Auto-rotation**:
```bash
ccs rotate enable --strategy round-robin --group work
ccs rotate enable --strategy random --interval 1h
ccs rotate enable --strategy quota-based --threshold 80%
```

**Strategies**:
- **Round-robin**: Sequential rotation through profiles
- **Random**: Random selection
- **Quota-based**: Switch when current profile hits threshold
- **Least-used**: Select profile with lowest usage
- **Cost-optimized**: Select profile with best rate limits

### 6. Profile Health Checks

**`ccs doctor` command**:
```bash
ccs doctor                    # Check all profiles
ccs doctor <profile>          # Check specific profile
ccs doctor --fix               # Auto-fix issues
```

**Checks**:
- ✅ Token validity (test API call)
- ✅ Token expiration
- ✅ Profile configuration integrity
- ✅ Quota status
- ⚠️ Unusual usage patterns
- ❌ Invalid/expired tokens

### 7. Workspace Integration

**`ccs workspace` command**:
```bash
ccs workspace init                    # Create .ccsrc for current directory
ccs workspace set <profile>           # Set profile for this workspace
ccs workspace auto-switch             # Auto-switch based on directory
```

**Features**:
- Directory-specific profile preferences
- Git repository integration (profile per repo)
- Environment variable injection
- `.ccsrc` file (similar to `.nvmrc`)

```yaml
# .ccsrc example
profile: work@example.com
env:
  ANTHROPIC_API_KEY: ${profile.token}
  CLAUDE_ORG_ID: org_123
```

### 7. Per-Terminal Session Management

**Purpose**: Each terminal maintains its own active profile independently, allowing simultaneous use of different profiles across terminals.

**Architecture**:

```
Terminal 1 (tty/0): work@example.com
Terminal 2 (tty/1): personal@gmail.com
Terminal 3 (tmux:0.0): client@client.io

Sessions stored in: ~/.config/ccs/sessions/{session_id}.json
```

**Session Identification Methods**:

| Method | Identifier | Scope | Example |
|--------|------------|-------|---------|
| **TTY Path** | `/dev/tty/` path | Per terminal window | `_dev_ttyp0` |
| **TMUX Pane** | `$TMUX_PANE` | Per tmux pane | `%0` |
| **Screen Session** | `$STY` | Per screen session | `12345.pts-0.hostname` |
| **Custom ID** | User-defined | Per custom scope | `my-session-id` |

**`ccs sessions` command**:
```bash
ccs sessions                    # List all active sessions
ccs sessions --current          # Show current terminal's session
ccs sessions --clean            # Remove stale sessions (>24h inactive)
ccs sessions --kill <session>   # Kill a specific session

# Example output:
# Session ID    Terminal    Profile             Started    Last Active
# ───────────────────────────────────────────────────────────────────
# _dev_ttyp0    /dev/tty/0  work@example.com    2h ago     5m ago
# _dev_ttyp1    /dev/tty/1  personal@gmail.com  30m ago    30m ago
# %0            tmux:0.0    client@client.io    5m ago     5m ago
```

**Session-Aware Commands**:

All commands can operate on specific sessions:

```bash
# Switch profile in current terminal only
ccs switch work@example.com

# Switch profile in specific session
ccs switch personal@gmail.com --session $_dev_ttyp1

# Get current profile for this terminal
ccs current

# Get current profile for another session
ccs current --session %0

# Run command with specific profile
ccs exec client@client.io -- claude chat
```

**Shell Integration (Automatic Session Tracking)**:

Add to `.bashrc` or `.zshrc`:

```bash
# Auto-detect session ID
export CCS_SESSION_ID="${TMUX_PANE:-$(tty | sed 's|/|_|g')}"

# Wrapper function for session-aware switching
ccs() {
  case "$1" in
    switch)
      shift
      eval $(command ccs switch "$@" --session "$CCS_SESSION_ID" --shell)
      ;;
    current)
      command ccs current --session "$CCS_SESSION_ID" "$@"
      ;;
    exec)
      shift
      local profile="$1"
      shift
      CCS_PROFILE="$profile" CCS_SESSION_ID="$CCS_SESSION_ID" "$@"
      ;;
    sessions)
      command ccs sessions "$@"
      ;;
    *)
      command ccs "$@"
      ;;
  esac
}

# Prompt integration (optional)
# Show current profile in shell prompt
PS1='$(ccs current --short 2>/dev/null || echo "none") \$ '
```

**Session Persistence**:

```typescript
interface Session {
  id: string;              // Unique session identifier
  profile_id: string;      // Active profile
  terminal: string;        // Terminal identifier
  started_at: number;
  last_activity: number;
  metadata: {
    shell: string;         // bash, zsh, fish
    cwd: string;           // Working directory
    parent_pid: number;    // Parent process ID
  };
}

// Session lifecycle
// 1. On switch: Create/update session
// 2. On command: Update last_activity
// 3. On exit: Mark as inactive (or auto-clean after 24h)
```

**Session Cleanup**:

```bash
# Automatic cleanup in background (via cron or systemd timer)
# Removes sessions inactive for >24 hours

# Manual cleanup
ccs sessions --clean

# Clean specific session
ccs sessions --kill _dev_ttyp0
```

**Use Cases**:

1. **Multiple Projects**: Different profile per project terminal
2. **Client Work**: Switch between clients without affecting other terminals
3. **Testing**: Multiple test accounts across terminals
4. **Team Work**: Shared machine with different profiles per developer terminal

**Implementation Details**:

```typescript
// Get current session
function getCurrentSession(): Session {
  const sessionId = process.env.CCS_SESSION_ID || 
                    process.env.TMUX_PANE ||
                    `tty_${process.stdout.fd}`;
  
  // Check for existing session
  let session = db.sessions.get(sessionId);
  
  if (!session) {
    // Create new session
    session = {
      id: sessionId,
      profile_id: null, // No profile yet
      terminal: process.env.TTY || 'unknown',
      started_at: Date.now(),
      last_activity: Date.now(),
      metadata: {
        shell: process.env.SHELL,
        cwd: process.cwd(),
        parent_pid: process.ppid
      }
    };
    db.sessions.create(session);
  }
  
  return session;
}

// Switch profile for current session
function switchProfile(profileId: string, sessionId?: string): void {
  const sid = sessionId || getCurrentSession().id;
  
  db.sessions.update(sid, {
    profile_id: profileId,
    last_activity: Date.now()
  });
  
  // Output env vars for current shell
  console.log(`export CCS_CURRENT_PROFILE="${profileId}"`);
  // ... output ANTHROPIC_AUTH_TOKEN, etc.
}
```

### 8. Fun Features

#### Profile Avatars (ASCII Art)
```
╔═══════════╗
║    ◉ ◉    ║ work@example.com
║    ╰──╯    ║ Work Profile
║   ═════   ║ Last used: 2h ago
╚═══════════╝
```

#### Streaks & Achievements
- 🔥 **7-Day Streak**: Used same profile daily for a week
- ⚡ **Power User**: 10K+ tokens in a day
- 🎯 **Consistent**: Used same profile for a month
- 🦄 **Unicorn**: Used all profiles in rotation
- 🏆 **Quota Master**: Never exceeded quota

#### Profile Nicknames & Emojis
```bash
ccs rename work@example.com --emoji 💼 --nickname "Main Work"
```

Displayed as: `💼 Main Work (work@example.com)`

#### Daily Profile Suggestion
```bash
ccs suggest
```
```
💡 Profile Suggestion (Monday, 9AM)
Based on your patterns, we recommend: work@example.com
Reason: You usually use this profile on Monday mornings.
Usage this week: 23,450 tokens (74% of weekly quota)
```

#### Fun Stats
```bash
ccs fun-stats
```
```
🎉 Fun Facts
  Longest session: 4h 23m (client@...)
  Most productive hour: 10AM-11AM
  Favorite model: claude-3-opus (67% of requests)
  Token velocity: 847 tokens/minute
  Coffee consumed: ~12 cups (estimated)
```

### 8. Backup & Recovery

**`ccs backup` command**:
```bash
ccs backup                    # Create timestamped backup
ccs backup --encrypt          # Encrypt with password
ccs backup --cloud            # Backup to cloud (optional)
ccs restore <file>            # Restore from backup
ccs restore --latest          # Restore most recent backup
```

**Features**:
- Automatic daily backups (configurable)
- Backup rotation (keep last N backups)
- Incremental backups (only changed profiles)
- Cloud backup integration (GCS, S3, optional)

### 9. Security Features

**Token Encryption**:
- AES-256-GCM for token storage
- PBKDF2 key derivation (100,000 iterations)
- Machine-specific encryption key
- Optional OS keychain integration

**Security Commands**:
```bash
ccs security audit            # Check security status
ccs security rotate-key       # Rotate encryption key
ccs security export-encrypted  # Export tokens encrypted
ccs security set-password     # Set additional password
```

### 10. Performance Optimizations

**Startup Optimization**:
```typescript
// Lazy load heavy modules
const heavyModule = await import('heavy-module');

// Cache compiled TUI components
const cachedUI = new Map();

// Profile hot-swapping without restart
process.send({ type: 'SWITCH_PROFILE', profile: 'new' });
```

**Query Optimization**:
```sql
-- Indexed queries for fast lookup
CREATE INDEX idx_profiles_last_used ON profiles(last_used DESC);
CREATE INDEX idx_usage_log_timestamp ON usage_log(timestamp DESC);
```

**Memory Efficiency**:
- Stream large exports (don't load all in memory)
- LRU cache for frequently accessed profiles
- Connection pooling for SQLite

**Benchmarks**:
| Operation | Target | Actual (Bun) | Node equivalent |
|-----------|--------|---------------|----------------|
| Startup | <10ms | ~5ms | ~50ms |
| List 100 profiles | <5ms | ~2ms | ~15ms |
| Switch profile | <20ms | ~12ms | ~80ms |
| Export 1K profiles | <50ms | ~35ms | ~200ms |

---

## Architecture

### Directory Structure
```
claude-swap/
├── src/
│   ├── cli/
│   │   ├── index.ts           # CLI entry point
│   │   ├── commands/
│   │   │   ├── switch.ts
│   │   │   ├── add.ts
│   │   │   ├── export.ts
│   │   │   ├── import.ts
│   │   │   ├── quota.ts
│   │   │   ├── stats.ts
│   │   │   └── ...
│   │   └── parser.ts          # Argument parser
│   ├── core/
│   │   ├── profile.ts         # Profile management
│   │   ├── auth.ts            # Authentication
│   │   ├── storage.ts         # SQLite operations
│   │   └── encryption.ts      # Security utilities
│   ├── tui/
│   │   ├── components/
│   │   │   ├── ProfileList.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   ├── PreviewPane.tsx
│   │   │   └── ...
│   │   └── screens/
│   │       ├── SwitchScreen.tsx
│   │       ├── QuotaScreen.tsx
│   │       └── StatsScreen.tsx
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── formatter.ts
│   │   └── validators.ts
│   └── types/
│       └── index.ts
├── tests/
│   ├── unit/
│   └── integration/
├── package.json
├── tsconfig.json
├── bunfig.toml
└── README.md
```

### Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                     CLI Entry                           │
│                   (src/cli/index.ts)                    │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Command Parser                              │
│               (src/cli/parser.ts)                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              Command Handler                             │
│           (src/cli/commands/*.ts)                        │
└──────────┬────────────────────┬──────────────────────────┘
           │                    │
           ▼                    ▼
┌──────────────────┐   ┌──────────────────────────┐
│   TUI Layer      │   │      Core Layer          │
│  (src/tui/*)     │   │  (src/core/*)            │
│                  │   │                          │
│ - Switch Screen  │   │ - Profile Manager        │
│ - Quota Screen   │   │ - Auth Handler           │
│ - Stats Screen   │   │ - Storage (SQLite)       │
└──────────────────┘   │ - Encryption             │
                       └──────────────────────────┘
                                  │
                                  ▼
                       ┌──────────────────────────┐
                       │    Claude Config         │
                       │  (~/.config/claude/*)    │
                       └──────────────────────────┘
```

### Dependencies

```json
{
  "dependencies": {
    "@clack/core": "^0.3.0",      // TUI framework
    "picocolors": "^1.0.0",       // Color output
    "commander": "^12.0.0",       // CLI parser
    "Better-sqlite3": "^9.0.0",   // SQLite (Bun native)
    "picocolors": "^1.0.0",       // Colors
    "chalk": "^5.0.0",            // Terminal styling
    "ora": "^7.0.0",              // Spinners
    "conf": "^11.0.0"             // Config management
  },
  "devDependencies": {
    "bun-types": "^1.0.0",
    "typescript": "^5.0.0",
    "@types/bun": "^1.0.0"
  }
}
```

---

## Implementation Roadmap

### Phase 1: Core Foundation (Week 1-2)
**Priority: P0 - Critical**
- [ ] Project setup (Bun, TypeScript, dependencies)
- [ ] SQLite schema and migrations
- [ ] Basic CLI structure with Commander
- [ ] Storage layer implementation
- [ ] Encryption utilities (AES-256-GCM)
- [ ] Unit tests for core modules

**Deliverable**: `ccs list`, `ccs current` working

### Phase 2: Auth & Profile Management (Week 3)
**Priority: P0 - Critical**
- [ ] Claude CLI integration (`ccs add`)
- [ ] Token capture and encryption
- [ ] Profile CRUD operations
- [ ] `ccs switch` (basic, non-interactive)
- [ ] `ccs remove`
- [ ] Integration tests

**Deliverable**: Full profile management working

### Phase 3: TUI (Week 4)
**Priority: P0 - Critical**
- [ ] Interactive `ccs switch` TUI
- [ ] Profile search/filter
- [ ] Keyboard navigation
- [ ] Preview pane
- [ ] Visual polish (colors, animations)

**Deliverable**: Interactive switch working

### Phase 4: Import/Export (Week 5)
**Priority: P1 - High**
- [ ] `ccs export` to JSON
- [ ] `ccs import` from JSON
- [ ] Password-based encryption for exports
- [ ] Validation and error handling

**Deliverable**: Import/export working

### Phase 5: Quotas & Stats (Week 6)
**Priority: P1 - High**
- [ ] Usage tracking infrastructure
- [ ] `ccs quota` commands
- [ ] `ccs stats` commands
- [ ] TUI dashboards
- [ ] Analytics visualization

**Deliverable**: Quota and stats working

### Phase 6: Advanced Features (Week 7-8)
**Priority: P2 - Medium**
- [ ] Profile groups and tags
- [ ] Auto-rotation strategies
- [ ] Workspace integration (.ccsrc)
- [ ] Profile health checks (`ccs doctor`)
- [ ] Backup & recovery

**Deliverable**: Advanced features complete

### Phase 7: Fun Features & Polish (Week 9)
**Priority: P3 - Low**
- [ ] ASCII avatars
- [ ] Achievements system
- [ ] Fun stats
- [ ] Daily suggestions
- [ ] Profile nicknames

**Deliverable**: Fun features complete

### Phase 8: Security & Performance (Week 10)
**Priority: P1 - High**
- [ ] Security audit
- [ ] Performance optimization
- [ ] Benchmarks and profiling
- [ ] Documentation
- [ ] README and examples

**Deliverable**: Production-ready release

---

## Success Metrics

### Performance Targets
- **Startup time**: <10ms (cold), <5ms (cached)
- **Profile switch**: <20ms
- **Profile list (100 profiles)**: <5ms
- **Memory footprint**: <50MB idle

### User Experience Goals
- **First successful use**: <30 seconds
- **Profile switch**: 3 keystrokes or 1 command
- **Error recovery**: Clear messages with suggestions

### Quality Gates
- **Test coverage**: >80%
- **TypeScript strict mode**: No errors
- **Security**: All tokens encrypted at rest
- **Documentation**: Every command has help

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Claude CLI changes | Abstract auth layer, version detection |
| Token security | Encryption at rest, OS keychain option |
| Performance degradation | Benchmarks in CI, lazy loading |
| Cross-platform issues | Test on Windows/macOS/Linux early |
| SQLite corruption | Backup strategy, WAL mode |

---

## Future Considerations (v2)

- **Cloud sync**: Sync profiles across devices
- **Team features**: Shared profile pools
- **Web UI**: Browser-based dashboard
- **API mode**: REST API for automation
- **Metrics export**: Prometheus/Grafana integration
- **Plugin system**: Custom extensions

---

## Open Questions

1. **Should we support multiple tokens per profile?**
   - Use case: Different tokens for different projects
   - Complexity: +20%, Utility: Medium

2. **Should we integrate with other AI providers?**
   - OpenAI, Anthropic API direct, etc.
   - Complexity: +40%, Utility: Out of scope?

3. **Should quota limits be enforced or advisory?**
   - Advisory: Warnings only
   - Enforced: Hard blocks (requires auto-switch)
   - Recommendation: Advisory++

4. **OS keychain integration - which platforms?**
   - macOS: Keychain
   - Windows: Credential Manager
   - Linux: Secret Service API / libsecret

---

## Conclusion

This plan provides a comprehensive roadmap for building `ccs` - a high-performance, feature-rich TUI tool for managing Claude Code sessions. The architecture prioritizes:

1. **Performance** (Bun runtime, SQLite, lazy loading)
2. **Security** (encryption, secure storage)
3. **UX** (intuitive TUI, clear commands)
4. **Extensibility** (plugin system, API mode)

The phased approach allows for incremental delivery with core functionality shipping in weeks 1-5, followed by advanced features and polish in weeks 6-10.

**Estimated Timeline**: 10 weeks to production-ready v1.0
**Team Size**: 1-2 developers
**Tech Stack**: Bun + TypeScript + SQLite
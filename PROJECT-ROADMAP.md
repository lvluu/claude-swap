# Claude Code Swap (ccs) - Project Roadmap

## Overview

This document tracks all GitHub issues for implementing ccs v1.0.0. Each issue is organized by phase and links to the corresponding GitHub issue.

## Phase1: Core Foundation (Week 1-2)

| Issue | Title | Description | Status |
|-------|-------|-------------|--------|
| [#1](https://github.com/lvluu/claude-swap/issues/1) | Project Scaffolding and Bun Setup | Initialize project with Bun, TypeScript, dependencies, and directory structure | 📋 Todo |
| [#2](https://github.com/lvluu/claude-swap/issues/2) | SQLite Database Schema and Migrations | Implement database schema with profiles, sessions, quotas, usage tables | 📋Todo |
| [#3](https://github.com/lvluu/claude-swap/issues/3) | Encryption Utilities | AES-256-GCM encryption with PBKDF2 key derivation for token storage | 📋Todo |
| [#4](https://github.com/lvluu/claude-swap/issues/4) | CLI Parser and Command Structure | Implement Commander.js CLI with all commands and options | 📋 Todo |
| [#5](https://github.com/lvluu/claude-swap/issues/5) | Type Definitions and Interfaces | Define all TypeScript interfaces for profiles, sessions, etc. | 📋Todo |

**Deliverable**: Basic CLI structure, database, encryption working

---

## Phase2: Auth & Profile Management (Week 3)

| Issue | Title | Description | Status |
|-------|-------|-------------|--------|
| [#6](https://github.com/lvluu/claude-swap/issues/6) | Profile Management CRUD Operations | Create, read, update, delete, search profiles | 📋 Todo |
| [#7](https://github.com/lvluu/claude-swap/issues/7) | OAuth Flow Integration | Integrate with `claude login` for token capture | 📋 Todo |
| [#8](https://github.com/lvluu/claude-swap/issues/8) | Manual Token Addition | Support custom API endpoints and manual token entry | 📋 Todo |
| [#9](https://github.com/lvluu/claude-swap/issues/9) | Basic Switch Command | Switch profiles with environment variable output | 📋 Todo |

**Deliverable**: Full profile management, authentication working

---

## Phase3: TUI (Week 4)

| Issue | Title | Description | Status |
|-------|-------|-------------|--------|
| [#10](https://github.com/lvluu/claude-swap/issues/10) | Interactive TUI Switcher | Build interactive TUI with search, navigation, preview | 📋Todo |

**Deliverable**: Interactive profileswitcher working

---

## Phase4: Import/Export (Week 5)

| Issue | Title | Description | Status |
|-------|-------|-------------|--------|
| [#11](https://github.com/lvluu/claude-swap/issues/11) | Export Profiles to JSON | Export all profiles with optional password encryption | 📋 Todo |

**Deliverable**: Profile import/export working

---

## Phase5: Quotas & Advanced Features (Week 6-8)

| Issue | Title | Description | Status |
|-------|-------|-------------|--------|
| [#12](https://github.com/lvluu/claude-swap/issues/12) | Quota Management System | Per-profile token limits with daily/monthly tracking | 📋 Todo |
| [#13](https://github.com/lvluu/claude-swap/issues/13) | Per-Terminal Session Management | Independent profile per terminal with session tracking | 📋 Todo |
| [#14](https://github.com/lvluu/claude-swap/issues/14) | Profile Groups and Rotation | Group profiles and rotate with various strategies | 📋Todo |

**Deliverable**: Quotas, sessions, groups working

---

## Phase6: Security & Release (Week 9-10)

| Issue | Title | Description | Status |
|-------|-------|-------------|--------|
| [#15](https://github.com/lvluu/claude-swap/issues/15) | v1.0.0 Release | Integration testing, documentation, security audit, release | 📋 Todo |

**Deliverable**: v1.0.0 published to npm

---

## Summary

- **Total Issues**: 15
- **Estimated Timeline**: 10 weeks
- **Target Release**: v1.0.0

## Key Features by Phase

### Phase 1-2: Foundation
- ✅ Bun + TypeScript setup
- ✅ SQLite database
- ✅ AES-256 encryption
- ✅ CLI structure
- ✅ Profile CRUD

### Phase 3-4: Core Features
- ✅ Interactive TUI
- ✅ OAuth integration
- ✅ Custom endpoints
- ✅ Import/export

### Phase 5: Advanced Features
- ✅ Quota tracking
- ✅ Per-terminal sessions
- ✅ Profile groups
- ✅ Rotation strategies

### Phase 6: Polish
- ✅ Security audit
- ✅ Documentation
- ✅ Performance optimization
- ✅ v1.0.0 release

## Getting Started

1. Start with **Issue #1** (Project Scaffolding)
2. Work through Phase 1 issues sequentially
3. Each issue links to detailed specifications in the plan
4. Check acceptance criteria before marking complete

## Progress Tracking

Track progress using GitHub Issues:
- 📋 Todo - Not started
- 🔄 In Progress - Currently working
- 👀 In Review - Ready for review
- ✅ Done - Completed

## Next Steps

1. Clone the repository
2. Start with Phase 1: Issue #1
3. Follow the plan in `.omc/plans/ccs-tui-plan.md`
4. Each issue has detailed acceptance criteria and implementation notes
5. Update issue status as you progress

---

**Full Plan**: `.omc/plans/ccs-tui-plan.md`
**Issues Dashboard**: https://github.com/lvluu/claude-swap/issues
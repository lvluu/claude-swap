# Testing Conventions — `claude-swap`

> Auto-generated from codebase analysis. Run `bun test` before every commit.

---

## Test Framework

| Concern | Value |
|---|---|
| Framework | `bun:test` (built into Bun runtime) |
| Runner | `bun test` |
| Watch mode | `bun test --watch` |
| Integration suite | `tests/integration/` |
| Unit suite | `tests/unit/` |

---

## Directory Structure

```
tests/
├── unit/
│   ├── encryption.test.ts
│   ├── storage.test.ts
│   └── cli.test.ts          # placeholder
└── integration/
    └── cli.test.ts          # placeholder
```

---

## Bun Test API

All imports come from `bun:test`:

```ts
import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";
```

| Function | Purpose |
|---|---|
| `describe(name, fn)` | Groups related tests; supports nested `describe` blocks |
| `test(name, fn)` | Individual test case |
| `expect(value)` | Assertion chain (`toBe`, `toEqual`, `toHaveLength`, `toBeNull`, `toThrow`, etc.) |
| `beforeAll(fn)` | Run once before all tests in the block |
| `beforeEach(fn)` | Run before each test |
| `afterAll(fn)` | Run once after all tests |
| `afterEach(fn)` | Run after each test |

---

## Naming Conventions

```ts
describe("Encryption", () => {           // Class/module name, PascalCase
  describe("Storage helpers", () => {    // Logical group, PascalCase
    test("encrypt produces different ciphertext each time", async () => {
      // ...
    });

    test("encrypt then decrypt roundtrip returns original token", async () => {
      // ...
    });
  });
});
```

---

## Test Patterns

### Encryption Tests

```ts
describe("Encryption", () => {
  let encryption: Encryption;

  beforeAll(() => {
    encryption = new Encryption();
  });

  test("encrypt produces different ciphertext each time", async () => {
    const encrypted1 = await encryption.encrypt(token);
    const encrypted2 = await encryption.encrypt(token);
    expect(encrypted1).not.toBe(encrypted2);
  });

  test("decrypt throws on tampered ciphertext", async () => {
    const encrypted = await encryption.encrypt("secret");
    const tampered = encrypted.slice(0, -5) + "XXXXX";
    expect(() => encryption.decryptSync(tampered)).toThrow();
  });

  test("encrypt then decrypt with unicode characters", async () => {
    const token = "sk-ant-🔐-token-日本語";
    const decrypted = await encryption.decrypt(await encryption.encrypt(token));
    expect(decrypted).toBe(token);
  });
});
```

### Storage / Database Tests

- Use temp files for SQLite DB to avoid side effects:
  ```ts
  const testDbPath = `/tmp/ccs-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
  const db = new Database(new (await import("bun:sqlite")).Database(testDbPath) as never);
  db.runMigrations();
  ```
- `beforeEach` creates a fresh DB; `afterEach` calls `closeDatabase()`
- Group by entity: `describe("Profile operations")`, `describe("Session operations")`, etc.
- Each test creates its own data; tests are independent and order-independent
- Assert exact property values, not just existence

### CLI Tests

Placeholder currently:
```ts
describe("CLI", () => {
  test("placeholder - CLI structure exists", () => {
    expect(true).toBe(true);
  });
});
```

---

## Assertion Reference

| Assertion | Use case |
|---|---|
| `toBe(val)` | Primitive equality (reference) |
| `toEqual(val)` | Deep equality (objects/arrays) |
| `toHaveLength(n)` | Array length |
| `toBeNull()` | Null check |
| `toBeTruthy()` / `toBeFalsy()` | Boolean-ish check |
| `toThrow()` | Function throws |
| `toThrow(EncryptionError)` | Specific error type |
| `.not.toBe(val)` | Inequality |
| `.not.toBeNull()` | Not null |

---

## Coverage Expectations

| Category | Expectation |
|---|---|
| New features | Tests required before merge |
| Bug fixes | Regression test required |
| Core modules (`encryption.ts`, `storage.ts`) | Comprehensive — edge cases, error paths, roundtrips |
| CLI stubs | Placeholder only until implemented |
| Utils (`formatter`, `logger`, `validators`) | No test files yet; add alongside implementation |
| TUI | No test files yet |

---

## CI Gate

```
bun run ci  # = typecheck && lint && format:check && test
```

CI runs on every PR and push to `main`. Tests must pass in CI (no `bun:test` skip flags).

---

## Test Database Isolation

- Never use the production DB path in tests
- Temp DB created per test file or test suite
- `afterEach` / `afterAll` calls `closeDatabase()` to release the Bun SQLite handle
- DB schema created via `db.runMigrations()` (same migration path as production)

---

## Mocking

- **No mocking framework in use** — tests use real `Encryption` and real `Database`
- If mocking is needed, prefer:
  - Dependency injection (pass mock instance)
  - Factory function override
- No `vi.fn()` / `jest.mock()` patterns (no Jest/Vitest installed)

---

## Edge Cases to Cover

For encryption:
- [x] Non-deterministic encryption (same input → different ciphertext)
- [x] Roundtrip fidelity (encrypt → decrypt = original)
- [x] Tampered ciphertext throws
- [x] Invalid base64 throws
- [x] Empty string
- [x] Unicode / non-ASCII characters
- [x] Long input (>200 chars)

For storage:
- [x] Create, read, update, delete (CRUD) per entity
- [x] Null foreign keys (e.g., `profile_id: null`)
- [x] JSON-serialized fields (`metadata`, `tags`) roundtrip correctly
- [x] `getAllProfiles` ordered by `last_used DESC`
- [x] Stale session deletion
- [x] Quota upsert (`ON CONFLICT`)
- [x] Settings get/set/delete

---

## What Needs Tests

| File | Status | Priority |
|---|---|---|
| `src/utils/formatter.ts` | No tests | Medium |
| `src/utils/logger.ts` | No tests | Medium |
| `src/utils/validators.ts` | No tests | Medium |
| `src/core/profile.ts` | No tests | High |
| `src/core/auth.ts` | No tests | Medium |
| `tests/integration/cli.test.ts` | Placeholder | High (once CLI is implemented) |
| `tests/unit/cli.test.ts` | Placeholder | High (once CLI is implemented) |

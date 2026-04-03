import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync } from "fs";
import { Database } from "../../src/core/storage.js";
import { Encryption } from "../../src/core/encryption.js";
import { randomUUID } from "crypto";

let profileId: string;
const tmpFiles: string[] = [];

beforeAll(() => {
  process.env.CI = "true";
  Bun.env.CI = "true";
  (Database as unknown as { instance: Database | null }).instance = null;
  (Encryption as unknown as { _instance: unknown })._instance = null;
  Database.initializeSync("/tmp/ccs-test-export.db");
  const db = Database.getInstance();
  const { encryptForStorage } = require("../../src/core/encryption.js");
  profileId = randomUUID();
  db.createProfile({
    id: profileId,
    name: "export-test-prof",
    token_encrypted: encryptForStorage("sk-ant-export-test"),
    auth_method: "manual",
    created_at: Date.now(),
    last_used: Date.now(), // ensure it sorts first
    use_count: 0,
    metadata: {},
    tags: [],
  });
});

afterEach(() => {
  for (const f of tmpFiles) {
    try { unlinkSync(f); } catch { /* noop */ }
  }
  tmpFiles.length = 0;
});

// ─── export ─────────────────────────────────────────────────────────────────

describe("ccs export", () => {
  test("writes valid JSON with version 1.0 and decrypted token", async () => {
    const path = `/tmp/ccs-test-export-${Date.now()}.json`;
    tmpFiles.push(path);
    const { exportCommand } = await import("../../src/cli/commands/export.js");
    const { stdout } = await captureOutput(async () => {
      await exportCommand(path, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Exported");
    const content = await Bun.file(path).text();
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe("1.0");
    expect(parsed.profiles).toBeInstanceOf(Array);
    // Find our profile by id
    const ourProfile = parsed.profiles.find((p: Record<string, unknown>) => p.id === profileId);
    expect(ourProfile).toBeDefined();
    expect(ourProfile!.name).toBe("export-test-prof");
    expect(ourProfile!.token).toBe("sk-ant-export-test");
  });

  test("--encrypt requires password", async () => {
    const path = `/tmp/ccs-test-export-enc-${Date.now()}.json`;
    tmpFiles.push(path);
    const { exportCommand } = await import("../../src/cli/commands/export.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await exportCommand(path, {
          opts: () => ({ encrypt: true }),
          parent: { opts: () => ({ quiet: false, json: false }) },
        } as unknown as import("commander").Command);
      });
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(2);
  });

  test("--encrypt with --password writes CCS-BACKUP-v1: envelope", async () => {
    const path = `/tmp/ccs-test-export-enc-${Date.now()}.json`;
    tmpFiles.push(path);
    const { exportCommand } = await import("../../src/cli/commands/export.js");
    const { stdout } = await captureOutput(async () => {
      await exportCommand(path, {
        opts: () => ({ encrypt: true, password: "testpw" }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Exported");
    const content = await Bun.file(path).text();
    expect(content.startsWith("CCS-BACKUP-v1:")).toBe(true);
  });

  test("with no profiles exits 1", async () => {
    const origDbInstance = (Database as unknown as { instance: Database | null }).instance;
    (Database as unknown as { instance: Database | null }).instance = null;
    (Encryption as unknown as { _instance: unknown })._instance = null;
    Database.initializeSync("/tmp/ccs-test-export-empty.db");
    const { exportCommand } = await import("../../src/cli/commands/export.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await exportCommand("/tmp/ccs-export-empty.json", {
          opts: () => ({}),
          parent: { opts: () => ({ quiet: false, json: false }) },
        } as unknown as import("commander").Command);
      });
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
      (Database as unknown as { instance: Database | null }).instance = origDbInstance;
    }
    expect(exitCode).toBe(1);
  });

  test("--quiet suppresses stdout", async () => {
    const path = `/tmp/ccs-test-export-q-${Date.now()}.json`;
    tmpFiles.push(path);
    const { exportCommand } = await import("../../src/cli/commands/export.js");
    const { stdout } = await captureOutput(async () => {
      await exportCommand(path, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: true, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toBe("");
  });
});

async function captureOutput(fn: () => Promise<void> | void): Promise<{ stdout: string; stderr: string }> {
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => stderr.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) => stderr.push(args.map(String).join(" "));
  try { await fn(); } finally { console.log = origLog; console.error = origError; console.warn = origWarn; }
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

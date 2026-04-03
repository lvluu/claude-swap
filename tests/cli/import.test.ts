import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync, writeFileSync } from "fs";
import { Database } from "../../src/core/storage.js";
import { Encryption } from "../../src/core/encryption.js";
import { testProfileName } from "../helpers.js";
import { randomUUID } from "crypto";

let profileName: string;
const tmpFiles: string[] = [];

beforeAll(() => {
  process.env.CI = "true";
  Bun.env.CI = "true";
  (Database as unknown as { instance: Database | null }).instance = null;
  (Encryption as unknown as { _instance: unknown })._instance = null;
  Database.initializeSync("/tmp/ccs-test-import.db");
  const db = Database.getInstance();
  const { encryptForStorage } = require("../../src/core/encryption.js");
  profileName = testProfileName("import");
  db.createProfile({
    id: randomUUID(),
    name: profileName,
    token_encrypted: encryptForStorage("sk-ant-import-original"),
    base_url: null,
    auth_method: "manual",
    created_at: Date.now(),
    last_used: 0,
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

// ─── import ──────────────────────────────────────────────────────────────────

describe("ccs import", () => {
  test("imports profiles from JSON", async () => {
    const path = `/tmp/ccs-test-import-${Date.now()}.json`;
    tmpFiles.push(path);
    writeFileSync(path, JSON.stringify({
      version: "1.0",
      exported_at: new Date().toISOString(),
      profiles: [{
        id: "imported-prof-id",
        name: "new-imported-prof",
        token: "sk-ant-imported-token",
        base_url: null,
        auth_method: "manual",
        metadata: {},
      }],
      settings: {},
    }));

    const { importCommand } = await import("../../src/cli/commands/import.js");
    const { stdout } = await captureOutput(async () => {
      await importCommand(path, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Imported");

    const db = Database.getInstance();
    const imported = db.getAllProfiles().find((p) => p.name === "new-imported-prof");
    expect(imported).not.toBeNull();
  });

  test("--skip silently skips duplicates", async () => {
    const path = `/tmp/ccs-test-import-skip-${Date.now()}.json`;
    tmpFiles.push(path);
    writeFileSync(path, JSON.stringify({
      version: "1.0",
      exported_at: new Date().toISOString(),
      profiles: [{ id: "skip-id", name: profileName, token: "sk-ant-skip", base_url: null, auth_method: "manual", metadata: {} }],
      settings: {},
    }));

    const { importCommand } = await import("../../src/cli/commands/import.js");
    const { stdout } = await captureOutput(async () => {
      await importCommand(path, {
        opts: () => ({ skip: true }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("skipped");
  });

  test("--overwrite replaces existing profile", async () => {
    const path = `/tmp/ccs-test-import-ow-${Date.now()}.json`;
    tmpFiles.push(path);
    writeFileSync(path, JSON.stringify({
      version: "1.0",
      exported_at: new Date().toISOString(),
      profiles: [{ id: `ow-${Date.now()}`, name: profileName, token: "sk-ant-overwritten", base_url: null, auth_method: "manual", metadata: {} }],
      settings: {},
    }));

    const { importCommand } = await import("../../src/cli/commands/import.js");
    const { stdout } = await captureOutput(async () => {
      await importCommand(path, {
        opts: () => ({ overwrite: true }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Imported");

    const db = Database.getInstance();
    const updated = db.getAllProfiles().find((p) => p.name === profileName);
    expect(updated).not.toBeNull();
    const { decryptFromStorage } = await import("../../src/core/encryption.js");
    expect(decryptFromStorage(updated!.token_encrypted)).toBe("sk-ant-overwritten");
  });

  test("nonexistent file exits 1", async () => {
    const { importCommand } = await import("../../src/cli/commands/import.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await importCommand("/tmp/does-not-exist-import.json", {
          opts: () => ({}),
          parent: { opts: () => ({ quiet: false, json: false }) },
        } as unknown as import("commander").Command);
      });
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(1);
  });

  test("invalid JSON exits 1", async () => {
    const path = `/tmp/ccs-test-import-invalid-${Date.now()}.json`;
    tmpFiles.push(path);
    writeFileSync(path, "not valid json {{{");

    const { importCommand } = await import("../../src/cli/commands/import.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await importCommand(path, {
          opts: () => ({}),
          parent: { opts: () => ({ quiet: false, json: false }) },
        } as unknown as import("commander").Command);
      });
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(1);
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

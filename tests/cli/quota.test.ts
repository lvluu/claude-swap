import { beforeAll, describe, expect, test } from "bun:test";
import { Database } from "../../src/core/storage.js";
import { Encryption } from "../../src/core/encryption.js";
import { testProfileName } from "../helpers.js";
import { randomUUID } from "crypto";

let profileName: string;

beforeAll(() => {
  process.env.CI = "true";
  Bun.env.CI = "true";
  (Database as unknown as { instance: Database | null }).instance = null;
  (Encryption as unknown as { _instance: unknown })._instance = null;
  Database.initializeSync("/tmp/ccs-test-quota.db");
  const db = Database.getInstance();
  const { encryptForStorage } = require("../../src/core/encryption.js");
  profileName = testProfileName("quota");
  db.createProfile({
    id: randomUUID(),
    name: profileName,
    token_encrypted: encryptForStorage("sk-ant-quota-test"),
    auth_method: "manual",
    created_at: Date.now(),
    last_used: 0,
    use_count: 0,
    metadata: {},
    tags: [],
  });
  db.setSetting("default_profile", profileName);
});

// ─── quota ───────────────────────────────────────────────────────────────────

describe("ccs quota", () => {
  test("shows daily and monthly", async () => {
    const { quotaCommand } = await import("../../src/cli/commands/quota.js");
    const { stdout } = await captureOutput(async () => {
      await quotaCommand(profileName, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Quota for:");
    expect(stdout).toContain("Daily:");
    expect(stdout).toContain("Monthly:");
  });

  test("--daily N sets limit", async () => {
    const db = Database.getInstance();
    const { quotaCommand } = await import("../../src/cli/commands/quota.js");
    const { stdout } = await captureOutput(async () => {
      await quotaCommand(profileName, {
        opts: () => ({ daily: 100000 }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Quota updated");
    const quota = db.getQuota(db.getAllProfiles().find((p) => p.name === profileName)!.id);
    expect(quota?.daily_limit).toBe(100000);
  });

  test("--monthly N sets limit", async () => {
    const db = Database.getInstance();
    const { quotaCommand } = await import("../../src/cli/commands/quota.js");
    const { stdout } = await captureOutput(async () => {
      await quotaCommand(profileName, {
        opts: () => ({ monthly: 1000000 }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Quota updated");
    const quota = db.getQuota(db.getAllProfiles().find((p) => p.name === profileName)!.id);
    expect(quota?.monthly_limit).toBe(1000000);
  });

  test("--json outputs JSON", async () => {
    const { quotaCommand } = await import("../../src/cli/commands/quota.js");
    const { stdout } = await captureOutput(async () => {
      await quotaCommand(profileName, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: true }) },
      } as unknown as import("commander").Command);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.profile).toBe(profileName);
    expect(parsed.daily).toBeDefined();
    expect(parsed.monthly).toBeDefined();
  });

  test("nonexistent profile exits 3", async () => {
    const { quotaCommand } = await import("../../src/cli/commands/quota.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await quotaCommand("nonexistent-quota-prof", {
          opts: () => ({}),
          parent: { opts: () => ({ quiet: false, json: false }) },
        } as unknown as import("commander").Command);
      });
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(3);
  });

  test("no profile and no default exits 1", async () => {
    const db = Database.getInstance();
    db.setSetting("default_profile", "");
    const { quotaCommand } = await import("../../src/cli/commands/quota.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await quotaCommand(undefined, {
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

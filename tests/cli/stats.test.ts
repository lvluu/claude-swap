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
  Database.initializeSync("/tmp/ccs-test-stats.db");
  const db = Database.getInstance();
  const { encryptForStorage } = require("../../src/core/encryption.js");
  profileName = testProfileName("stats");
  db.createProfile({
    id: randomUUID(),
    name: profileName,
    token_encrypted: encryptForStorage("sk-ant-stats-test"),
    auth_method: "manual",
    created_at: Date.now(),
    last_used: 0,
    use_count: 0,
    metadata: {},
    tags: [],
  });
  db.setSetting("default_profile", profileName);

  // Add some usage logs (create sessions first to satisfy FK constraint)
  const prof = db.getAllProfiles().find((p) => p.name === profileName)!;
  const s1 = `stats-session-${Date.now()}`;
  const s2 = `stats-session-${Date.now() - 1}`;
  db.createSession({ id: s1, profile_id: prof.id, terminal: s1, started_at: Date.now(), last_activity: Date.now(), metadata: { shell: "bash", cwd: "/tmp", parent_pid: 1 } });
  db.createSession({ id: s2, profile_id: prof.id, terminal: s2, started_at: Date.now(), last_activity: Date.now(), metadata: { shell: "bash", cwd: "/tmp", parent_pid: 1 } });
  db.logUsage({ profile_id: prof.id, session_id: s1, timestamp: Date.now(), tokens_used: 500, model: "claude-3-5-sonnet" });
  db.logUsage({ profile_id: prof.id, session_id: s2, timestamp: Date.now() - 3600000, tokens_used: 1200, model: "claude-3-opus" });
});

// ─── stats ───────────────────────────────────────────────────────────────────

describe("ccs stats", () => {
  test("shows total tokens and count", async () => {
    const { statsCommand } = await import("../../src/cli/commands/stats.js");
    const { stdout } = await captureOutput(async () => {
      await statsCommand(profileName, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Total tokens:");
    expect(stdout).toContain("Total requests:");
  });

  test("--daily shows per-day breakdown with date", async () => {
    const { statsCommand } = await import("../../src/cli/commands/stats.js");
    const { stdout } = await captureOutput(async () => {
      await statsCommand(profileName, {
        opts: () => ({ daily: true, export: undefined }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Total tokens:");
    // Should contain "Breakdown by day:" (daily option selected)
    expect(stdout).toContain("Breakdown by day:");
  });

  test("--json outputs JSON with profile, total, count", async () => {
    const { statsCommand } = await import("../../src/cli/commands/stats.js");
    const { stdout } = await captureOutput(async () => {
      await statsCommand(profileName, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: true }) },
      } as unknown as import("commander").Command);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.profile).toBe(profileName);
    expect(parsed.total).toBeDefined();
    expect(parsed.count).toBeDefined();
  });

  test("--export csv outputs CSV header", async () => {
    const { statsCommand } = await import("../../src/cli/commands/stats.js");
    const { stdout } = await captureOutput(async () => {
      await statsCommand(profileName, {
        opts: () => ({ export: "csv" }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("timestamp,tokens,model");
  });

  test("--export json outputs JSON", async () => {
    const { statsCommand } = await import("../../src/cli/commands/stats.js");
    const { stdout } = await captureOutput(async () => {
      await statsCommand(profileName, {
        opts: () => ({ export: "json" }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.profile).toBe(profileName);
    expect(parsed.total).toBeDefined();
  });

  test("nonexistent profile exits 3", async () => {
    const { statsCommand } = await import("../../src/cli/commands/stats.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await statsCommand("nonexistent-stats-prof", {
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

import { beforeAll, describe, expect, test } from "bun:test";
import { Database } from "../../src/core/storage.js";
import { Encryption } from "../../src/core/encryption.js";
import { captureOutput, testProfileName } from "../helpers.js";
import { randomUUID } from "crypto";

let profileName: string;

beforeAll(() => {
  process.env.CI = "true";
  Bun.env.CI = "true";
  (Database as unknown as { instance: Database | null }).instance = null;
  (Encryption as unknown as { _instance: unknown })._instance = null;
  Database.initializeSync("/tmp/ccs-test-current.db");
  const db = Database.getInstance();
  const { encryptForStorage } = require("../../src/core/encryption.js");
  profileName = testProfileName("current");
  db.createProfile({
    id: randomUUID(),
    name: profileName,
    token_encrypted: encryptForStorage("sk-ant-current-test"),
    auth_method: "manual",
    created_at: Date.now(),
    last_used: 0,
    use_count: 0,
    metadata: {},
    tags: [],
  });
  db.setSetting("default_profile", profileName);

  // Create a session for the profile
  const prof = db.getAllProfiles().find((p) => p.name === profileName)!;
  const sessionId = `test-session-${Date.now()}`;
  db.createSession({
    id: sessionId,
    profile_id: prof.id,
    terminal: sessionId,
    started_at: Date.now(),
    last_activity: Date.now(),
    metadata: { shell: "bash", cwd: "/tmp", parent_pid: 1 },
  });
  Bun.env.CCS_SESSION_ID = sessionId;
});

// ─── current ─────────────────────────────────────────────────────────────────

describe("ccs current", () => {
  test("exits 1 with no session", async () => {
    Bun.env.CCS_SESSION_ID = "nonexistent-session";
    const { currentCommand } = await import("../../src/cli/commands/current.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await currentCommand({
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

  test("shows Active profile line with name and id", async () => {
    const db = Database.getInstance();
    const prof = db.getAllProfiles().find((p) => p.name === profileName)!;
    const sessionId = `test-session-${Date.now()}-2`;
    db.createSession({
      id: sessionId,
      profile_id: prof.id,
      terminal: sessionId,
      started_at: Date.now(),
      last_activity: Date.now(),
      metadata: { shell: "bash", cwd: "/tmp", parent_pid: 1 },
    });
    Bun.env.CCS_SESSION_ID = sessionId;

    const { currentCommand } = await import("../../src/cli/commands/current.js");
    const { stdout } = await captureOutput(async () => {
      await currentCommand({
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    // Actual format: "Active profile: <name> (<id>)"
    expect(stdout).toContain("Active profile:");
    expect(stdout).toContain(profileName);
  });

  test("--short prints only profile name", async () => {
    const db = Database.getInstance();
    const prof = db.getAllProfiles().find((p) => p.name === profileName)!;
    const sessionId = `test-session-${Date.now()}-3`;
    db.createSession({
      id: sessionId,
      profile_id: prof.id,
      terminal: sessionId,
      started_at: Date.now(),
      last_activity: Date.now(),
      metadata: { shell: "bash", cwd: "/tmp", parent_pid: 1 },
    });
    Bun.env.CCS_SESSION_ID = sessionId;

    const { currentCommand } = await import("../../src/cli/commands/current.js");
    const { stdout } = await captureOutput(async () => {
      await currentCommand({
        opts: () => ({ short: true }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout.trim()).toBe(profileName);
  });

  test("--json outputs valid JSON", async () => {
    const db = Database.getInstance();
    const prof = db.getAllProfiles().find((p) => p.name === profileName)!;
    const sessionId = `test-session-${Date.now()}-4`;
    db.createSession({
      id: sessionId,
      profile_id: prof.id,
      terminal: sessionId,
      started_at: Date.now(),
      last_activity: Date.now(),
      metadata: { shell: "bash", cwd: "/tmp", parent_pid: 1 },
    });
    Bun.env.CCS_SESSION_ID = sessionId;

    const { currentCommand } = await import("../../src/cli/commands/current.js");
    const { stdout } = await captureOutput(async () => {
      await currentCommand({
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: true }) },
      } as unknown as import("commander").Command);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.profile.name).toBe(profileName);
    expect(parsed.session_id).toBeDefined();
    expect(parsed.terminal).toBeDefined();
  });

  test("--quiet with no profile produces no stdout", async () => {
    Bun.env.CCS_SESSION_ID = "nonexistent-session";
    const { currentCommand } = await import("../../src/cli/commands/current.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await currentCommand({
          opts: () => ({}),
          parent: { opts: () => ({ quiet: true, json: false }) },
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

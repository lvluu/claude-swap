import { beforeAll, describe, expect, test } from "bun:test";
import { Database } from "../../src/core/storage.js";
import { Encryption } from "../../src/core/encryption.js";
import { captureOutput } from "../helpers.js";

let sessionId: string;

beforeAll(() => {
  process.env.CI = "true";
  Bun.env.CI = "true";
  (Database as unknown as { instance: Database | null }).instance = null;
  (Encryption as unknown as { _instance: unknown })._instance = null;
  Database.initializeSync("/tmp/ccs-test-sessions.db");
  const db = Database.getInstance();
  sessionId = `test-session-${Date.now()}`;
  db.createSession({
    id: sessionId,
    profile_id: null,
    terminal: sessionId,
    started_at: Date.now(),
    last_activity: Date.now(),
    metadata: { shell: "bash", cwd: "/tmp", parent_pid: 1 },
  });
  Bun.env.CCS_SESSION_ID = sessionId;
});

// ─── sessions ─────────────────────────────────────────────────────────────────

describe("ccs sessions", () => {
  test("lists sessions with padded format", async () => {
    const { sessionsCommand } = await import("../../src/cli/commands/sessions.js");
    const { stdout } = await captureOutput(async () => {
      await sessionsCommand({
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    // Actual format: "  <id8>  <terminal.pad20>  <profile.pad20>  <age>"
    expect(stdout).toContain(sessionId.slice(0, 8));
  });

  test("--json outputs valid JSON array", async () => {
    const { sessionsCommand } = await import("../../src/cli/commands/sessions.js");
    const { stdout } = await captureOutput(async () => {
      await sessionsCommand({
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: true }) },
      } as unknown as import("commander").Command);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toBeArray();
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty("id");
      expect(parsed[0]).toHaveProperty("terminal");
      expect(parsed[0]).toHaveProperty("is_stale");
    }
  });

  test("--current shows Session: and Terminal:", async () => {
    const { sessionsCommand } = await import("../../src/cli/commands/sessions.js");
    const { stdout } = await captureOutput(async () => {
      await sessionsCommand({
        opts: () => ({ current: true }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    // Actual format: "Session: <id>", "  Terminal: <term>", "  Profile: ...", "  Active: ..."
    expect(stdout).toContain("Session:");
    expect(stdout).toContain("Terminal:");
  });

  test("--current --json outputs JSON with id and terminal", async () => {
    const { sessionsCommand } = await import("../../src/cli/commands/sessions.js");
    const { stdout } = await captureOutput(async () => {
      await sessionsCommand({
        opts: () => ({ current: true }),
        parent: { opts: () => ({ quiet: false, json: true }) },
      } as unknown as import("commander").Command);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.id).toBeDefined();
    expect(parsed.terminal).toBeDefined();
  });

  test("--kill removes session", async () => {
    const db = Database.getInstance();
    const killId = `kill-session-${Date.now()}`;
    db.createSession({
      id: killId,
      profile_id: null,
      terminal: killId,
      started_at: Date.now(),
      last_activity: Date.now(),
      metadata: { shell: "bash", cwd: "/tmp", parent_pid: 1 },
    });

    const { sessionsCommand } = await import("../../src/cli/commands/sessions.js");
    const { stdout } = await captureOutput(async () => {
      await sessionsCommand({
        opts: () => ({ kill: killId }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    // Actual format: "Killed session: <id>"
    expect(stdout).toContain("Killed session:");
    expect(stdout).toContain(killId);
    expect(db.getSessionById(killId)).toBeNull();
  });

  test("--kill nonexistent exits 7", async () => {
    const { sessionsCommand } = await import("../../src/cli/commands/sessions.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await captureOutput(async () => {
        await sessionsCommand({
          opts: () => ({ kill: "does-not-exist" }),
          parent: { opts: () => ({ quiet: false, json: false }) },
        } as unknown as import("commander").Command);
      });
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(7);
  });

  test("--clean removes stale sessions", async () => {
    const { sessionsCommand } = await import("../../src/cli/commands/sessions.js");
    const { stdout } = await captureOutput(async () => {
      await sessionsCommand({
        opts: () => ({ clean: true }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("Removed");
    expect(stdout).toContain("stale session(s)");
  });

  test("--quiet suppresses info output", async () => {
    const { sessionsCommand } = await import("../../src/cli/commands/sessions.js");
    const { stdout } = await captureOutput(async () => {
      await sessionsCommand({
        opts: () => ({}),
        parent: { opts: () => ({ quiet: true, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toBe("");
  });
});

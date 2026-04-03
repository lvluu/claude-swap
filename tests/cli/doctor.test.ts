import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Database } from "../../src/core/storage.js";
import { Encryption } from "../../src/core/encryption.js";
import { testProfileName } from "../helpers.js";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync } from "fs";

const REAL_HOME = process.env.HOME!;

let rcPath: string;
let origContent: string | null = null;

beforeAll(() => {
  process.env.CI = "true";
  Bun.env.CI = "true";
  (Database as unknown as { instance: Database | null }).instance = null;
  (Encryption as unknown as { _instance: unknown })._instance = null;
  Database.initializeSync("/tmp/ccs-test-doctor.db");

  // doctor.ts uses process.env.SHELL, not Bun.env — detect the actual shell
  const actualShell = process.env.SHELL?.split("/").pop() ?? "bash";
  rcPath = `${REAL_HOME}/.${actualShell}rc`;

  try {
    origContent = readFileSync(rcPath, "utf8");
  } catch {
    origContent = null;
  }

  // Install marker so hasMarkerBlock() returns true
  if (!origContent?.includes("# >>> ccs profile manager >>>")) {
    try {
      const marker = "\n# >>> ccs profile manager >>>\neval \"$(ccs hook bash)\"\n# <<< ccs profile manager <<<\n";
      writeFileSync(rcPath, (origContent ?? "") + marker, { mode: 0o644 });
    } catch { /* CI may not have write access to ~/.zshrc */ }
  }
});

afterAll(() => {
  if (origContent !== null) {
    try {
      writeFileSync(rcPath, origContent, { mode: 0o644 });
    } catch { /* ignore */ }
  } else {
    try {
      const { unlinkSync } = require("fs");
      unlinkSync(rcPath);
    } catch { /* ignore */ }
  }
});

// ─── doctor ───────────────────────────────────────────────────────────────────

describe("ccs doctor", () => {
  test("exits 0 when healthy", async () => {
    const db = Database.getInstance();
    const { encryptForStorage } = require("../../src/core/encryption.js");
    const name = testProfileName("doc");
    db.createProfile({
      id: randomUUID(),
      name,
      token_encrypted: encryptForStorage("sk-ant-doc-test"),
      auth_method: "manual",
      created_at: Date.now(),
      last_used: 0,
      use_count: 0,
      metadata: {},
      tags: [],
    });
    db.setSetting("default_profile", name);

    const { doctorCommand } = await import("../../src/cli/commands/doctor.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await doctorCommand(undefined, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(0);
  });

  test("--fix sets default profile", async () => {
    const db = Database.getInstance();
    db.setSetting("default_profile", "");
    const { encryptForStorage } = require("../../src/core/encryption.js");
    const name = testProfileName("fix");
    db.createProfile({
      id: randomUUID(),
      name,
      token_encrypted: encryptForStorage("sk-ant-fix-test"),
      auth_method: "manual",
      created_at: Date.now(),
      last_used: 0,
      use_count: 0,
      metadata: {},
      tags: [],
    });

    const { doctorCommand } = await import("../../src/cli/commands/doctor.js");
    const { stdout } = await captureOutput(async () => {
      await doctorCommand(undefined, {
        opts: () => ({ fix: true }),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    });
    expect(stdout).toContain("default profile");
    expect(db.getSetting<string>("default_profile")).toBeTruthy();
  });

  test("nonexistent profile exits 3", async () => {
    const { doctorCommand } = await import("../../src/cli/commands/doctor.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await doctorCommand("nonexistent-doc-profile", {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(3);
  });

  test("valid profile exits 0", async () => {
    const db = Database.getInstance();
    const { encryptForStorage } = require("../../src/core/encryption.js");
    const name = testProfileName("docprof");
    db.createProfile({
      id: randomUUID(),
      name,
      token_encrypted: encryptForStorage("sk-ant-docprof-test"),
      auth_method: "manual",
      created_at: Date.now(),
      last_used: 0,
      use_count: 0,
      metadata: {},
      tags: [],
    });

    const { doctorCommand } = await import("../../src/cli/commands/doctor.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await doctorCommand(name, {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(0);
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
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
  }
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

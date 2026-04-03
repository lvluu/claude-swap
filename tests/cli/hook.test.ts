import { beforeAll, describe, expect, test } from "bun:test";
import { Database } from "../../src/core/storage.js";
import { Encryption } from "../../src/core/encryption.js";

beforeAll(() => {
  process.env.CI = "true";
  Bun.env.CI = "true";
  (Database as unknown as { instance: Database | null }).instance = null;
  (Encryption as unknown as { _instance: unknown })._instance = null;
  Database.initializeSync("/tmp/ccs-test-hook.db");
});

// ─── hook ─────────────────────────────────────────────────────────────────────

describe("ccs hook", () => {
  test("bash outputs function to stdout via process.stdout.write interposition", async () => {
    // Import dynamically AFTER DB is initialized
    const { hookCommand } = await import("../../src/cli/commands/hook.js");

    // Intercept process.stdout.write BEFORE calling the async function
    let stdout = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => { stdout += chunk; return true; }) as typeof process.stdout.write;

    // Also intercept console.log in case anything uses it
    const origLog = console.log;
    const logChunks: string[] = [];
    console.log = (...a: unknown[]) => { logChunks.push(a.map(String).join(" ")); };

    await hookCommand("bash", {
      opts: () => ({}),
      parent: { opts: () => ({ quiet: false, json: false }) },
    } as unknown as import("commander").Command);

    process.stdout.write = origWrite;
    console.log = origLog;

    const output = stdout + logChunks.join("\n");
    expect(output).toContain("function ccs()");
    expect(output).toContain("ccs env");
  });

  test("zsh outputs function to stdout", async () => {
    const { hookCommand } = await import("../../src/cli/commands/hook.js");
    let stdout = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => { stdout += chunk; return true; }) as typeof process.stdout.write;
    const origLog = console.log;
    const logChunks: string[] = [];
    console.log = (...a: unknown[]) => { logChunks.push(a.map(String).join(" ")); };

    await hookCommand("zsh", {
      opts: () => ({}),
      parent: { opts: () => ({ quiet: false, json: false }) },
    } as unknown as import("commander").Command);

    process.stdout.write = origWrite;
    console.log = origLog;

    const output = stdout + logChunks.join("\n");
    expect(output).toContain("function ccs");
    expect(output).toContain("ccs env");
  });

  test("fish outputs function to stdout", async () => {
    const { hookCommand } = await import("../../src/cli/commands/hook.js");
    let stdout = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => { stdout += chunk; return true; }) as typeof process.stdout.write;
    const origLog = console.log;
    const logChunks: string[] = [];
    console.log = (...a: unknown[]) => { logChunks.push(a.map(String).join(" ")); };

    await hookCommand("fish", {
      opts: () => ({}),
      parent: { opts: () => ({ quiet: false, json: false }) },
    } as unknown as import("commander").Command);

    process.stdout.write = origWrite;
    console.log = origLog;

    const output = stdout + logChunks.join("\n");
    expect(output).toContain("function ccs");
    expect(output).toContain("ccs env");
  });

  test("unsupported shell exits 2", async () => {
    const { hookCommand } = await import("../../src/cli/commands/hook.js");
    let exitCode = 0;
    const origExit = process.exit as (code?: number) => never;
    (process.exit as unknown as (code?: number) => never) = ((code) => {
      exitCode = code ?? 0;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await hookCommand("csh", {
        opts: () => ({}),
        parent: { opts: () => ({ quiet: false, json: false }) },
      } as unknown as import("commander").Command);
    } catch (e) {
      if ((e as Error).message !== "exit") throw e;
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(2);
  });
});

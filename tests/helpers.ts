import { randomUUID } from "crypto";

/** Runs ccs with the given args via Bun's CLI runner, capturing stdout and stderr. */
export async function runCcs(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "x", "src/cli/index.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

/**
 * Captures both stdout and stderr from a function that calls console.log / console.error.
 * For --json error cases, respondError() writes JSON to stdout (not stderr).
 * Use this helper to capture both streams.
 */
export async function captureOutput(
  fn: () => Promise<void> | void,
): Promise<{ stdout: string; stderr: string }> {
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...args: unknown[]) => stdout.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) =>
    stderr.push(args.map(String).join(" "));
  console.warn = (...args: unknown[]) =>
    stderr.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
  }
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n") };
}

/** Generates a unique test profile name to avoid collisions. */
export function testProfileName(prefix = "test"): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

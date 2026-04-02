import type { Command } from "commander";

export interface CliFlags {
  quiet: boolean;
  json: boolean;
  shell: boolean;
  local: boolean;
  persistent: boolean;
}

/** Merges command-level and global-level flags. Global opts are the fallback. */
export function getFlags(cmd: Command): CliFlags {
  const parent = cmd.parent;
  const opts = cmd.opts();
  return {
    quiet: opts.quiet ?? parent?.opts().quiet ?? false,
    json: opts.json ?? parent?.opts().json ?? false,
    shell: opts.shell ?? parent?.opts().shell ?? false,
    local: opts.local ?? false,
    persistent: opts.persistent ?? false,
  };
}

/** Info output — suppressed when --quiet or --json. */
export function info(flags: CliFlags, message: string): void {
  if (!flags.quiet && !flags.json) console.log(message);
}

/** Error output — NEVER suppressed. */
export function error(message: string): void {
  console.error(message);
}

/** Security warning — NEVER suppressed by --quiet, distinct channel from info. */
export function warnSecurity(flags: CliFlags, message: string): void {
  // Security warnings are never suppressed by --quiet per spec.
  if (flags.json) {
    console.warn("[SECURITY]", message);
  } else {
    console.warn(message);
  }
}

/** Serialize data to stdout. In JSON mode wraps everything; otherwise caller renders. */
export function respond(flags: CliFlags, data: unknown): void {
  if (flags.json) {
    console.log(JSON.stringify(data, null, 2));
  }
  // In non-JSON mode the caller prints directly via info()
}

/** Print error and exit. In JSON mode emits {error} to stdout instead of stderr. */
export function respondError(flags: CliFlags, message: string, code = 1): never {
  if (flags.json) {
    console.log(JSON.stringify({ error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(code);
}

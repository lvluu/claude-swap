import { readFileSync, writeFileSync } from "fs";
import type { Profile } from "../types/index.js";

const ENV_VAR = "ANTHROPIC_AUTH_TOKEN";

/** Formats env vars as shell `export` statements. Never outputs raw token value. */
export function formatShell(_profile: Profile, token: string): string {
  // SECURITY: never echo the raw token in --shell output; the shell function
  // receives it via eval and injects it, but stdout must not expose it.
  return `export ${ENV_VAR}="${token.replace(/"/g, '\\"')}"`;
}

/** Formats env vars as a .env file content string. */
export function formatLocal(profile: Profile, token: string): string {
  return `${ENV_VAR}="${token}"\nCCS_PROFILE="${profile.name}"`;
}

/** Formats a single line for ~/.ccsrc persistent config. */
export function formatPersistent(profile: Profile): string {
  return `CCS_PROFILE="${profile.name}"`;
}

/** Writes .env file to the current working directory. */
export function writeLocalEnv(profile: Profile, token: string): void {
  const content = formatLocal(profile, token);
  writeFileSync(`${process.cwd()}/.env`, content, { mode: 0o600 });
}

/** Reads the current .env file from CWD if it exists. Returns null if absent. */
export function readLocalEnv(): Record<string, string> | null {
  try {
    const content = readFileSync(`${process.cwd()}/.env`, "utf8");
    const env: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 0) continue;
      env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, "");
    }
    return env;
  } catch {
    return null;
  }
}

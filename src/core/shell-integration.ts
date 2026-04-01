import { readFileSync, writeFileSync } from "fs";

const MARKER_START = "# >>> ccs profile manager >>>";
const MARKER_END = "# <<< ccs profile manager <<<";

const RC_FILES: Record<string, string> = {
  bash: `${Bun.env.HOME}/.bashrc`,
  zsh: `${Bun.env.HOME}/.zshrc`,
  fish: `${Bun.env.FISH_CONFIG ?? Bun.env.HOME + "/.config/fish/config.fish"}`,
  sh: `${Bun.env.HOME}/.profile`,
};

/** Returns the path to the RC file for the given shell name. */
export function getRcPath(shell: string): string {
  return RC_FILES[shell] ?? `${Bun.env.HOME}/.${shell}rc`;
}

/** Returns true if the RC file already contains a ccs marker block. */
export function hasMarkerBlock(rcPath: string): boolean {
  try {
    const content = readFileSync(rcPath, "utf8");
    return content.includes(MARKER_START) && content.includes(MARKER_END);
  } catch {
    return false;
  }
}

/** Reads the RC file. Returns "" if absent. */
function readRc(rcPath: string): string {
  try {
    return readFileSync(rcPath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Idempotently appends a marker block + eval line to the RC file.
 * Skipped if MARKER_START is already present.
 */
export function installShellHook(shell = "bash"): void {
  const rcPath = getRcPath(shell);
  const content = readRc(rcPath);

  if (content.includes(MARKER_START)) return; // already installed

  const hook = `eval "$(ccs hook ${shell})"`;
  const block = `\n${MARKER_START}\n${hook}\n${MARKER_END}\n`;

  writeFileSync(rcPath, content + block, { mode: 0o644 });
}

/**
 * Removes the marker block from the RC file if present.
 * Returns true if a block was removed.
 */
export function uninstallShellHook(shell = "bash"): boolean {
  const rcPath = getRcPath(shell);
  const content = readRc(rcPath);

  if (!content.includes(MARKER_START)) return false;

  const regex = new RegExp(`\\n?${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`, "g");
  writeFileSync(rcPath, content.replace(regex, "\n"), { mode: 0o644 });
  return true;
}

/** Reads ~/.ccsrc and returns the active profile name, or null. */
export function readCcsrc(): string | null {
  try {
    const content = readFileSync(`${Bun.env.HOME}/.ccsrc`, "utf8");
    const match = content.match(/CCS_PROFILE="([^"]+)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Writes CCS_PROFILE to ~/.ccsrc atomically (overwrites). */
export function writeCcsrc(profileName: string): void {
  writeFileSync(`${Bun.env.HOME}/.ccsrc`, `CCS_PROFILE="${profileName}"\n`, { mode: 0o600 });
}
